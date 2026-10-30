// Commit atômico de vários arquivos via Git Data API (árvore + commit + ref).
// Se a branch andou no meio do caminho, refaz a partir do novo topo (até 3 vezes).
// Com `removerPasta`, apaga no mesmo commit todos os arquivos que estão nessa pasta.

export class ErroGitHub extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

function explicar(status: number, mensagem: string): string {
  if (status === 401) return 'Token do GitHub inválido ou expirado (secret GITHUB_TOKEN_SQUAD).';
  if (status === 403 || status === 404) return `O token do GitHub não tem permissão "Contents: write" neste repositório (${status}: ${mensagem}).`;
  return `GitHub respondeu ${status}: ${mensagem}`;
}

export async function commitarArquivos(token: string, repo: string, branch: string, arquivos: Record<string, string>, mensagem: string, removerPasta?: string): Promise<string> {
  const api = async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'squadtech-esteira',
        'Content-Type': 'application/json',
      },
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroGitHub(r.status, explicar(r.status, corpo.message ?? r.statusText));
    return corpo;
  };

  for (let tentativa = 1; ; tentativa++) {
    const ref = await api(`/git/ref/heads/${branch}`);
    const base = ref.object.sha as string;
    const commitBase = await api(`/git/commits/${base}`);
    const remover: { path: string; mode: string; type: string; sha: null }[] = [];
    if (removerPasta) {
      const atual = await api(`/git/trees/${commitBase.tree.sha}?recursive=1`);
      if (atual.truncated) throw new Error('A árvore do repositório é grande demais para remover a pasta pela API.');
      for (const item of atual.tree as { path: string; type: string }[]) {
        if (item.type === 'blob' && item.path.startsWith(removerPasta) && !(item.path in arquivos)) remover.push({ path: item.path, mode: '100644', type: 'blob', sha: null });
      }
    }
    const arvore = await api('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commitBase.tree.sha,
        tree: [...Object.entries(arquivos).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })), ...remover],
      }),
    });
    const novo = await api('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensagem, tree: arvore.sha, parents: [base] }) });
    try {
      await api(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: novo.sha, force: false }) });
      return novo.sha as string;
    } catch (e) {
      // 422: a branch andou desde que lemos (não é fast-forward). Tenta de novo.
      if (e instanceof ErroGitHub && e.status === 422 && tentativa < 3) continue;
      throw e;
    }
  }
}
