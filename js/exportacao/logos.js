// Logos do cabeçalho dos slides (slides.md, seção 1): lidos da raiz do site (mesma origem), como a tela. Arquivo ausente ou
// que não seja imagem não falha a exportação: o slide mostra uma caixa tracejada e o usuário é avisado.
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = /^image\/(png|jpeg|webp)$/;

export const ARQUIVOS_LOGO = { esquerda: 'logo-esquerda.png', direita: 'logo-direita.png' };

function blobParaDataUrl(blob) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.addEventListener('load', () => ok(String(leitor.result)));
    leitor.addEventListener('error', () => falha(leitor.error));
    leitor.readAsDataURL(blob);
  });
}

async function medirNoNavegador(blob) {
  const img = await createImageBitmap(blob);
  const dim = { largura: img.width, altura: img.height };
  img.close();
  return dim;
}

/**
 * Lê os dois logos. Devolve { esquerda, direita } com { dados: 'image/png;base64,...', largura, altura } ou null quando ausente.
 * `buscar` e `medir` existem para os testes.
 */
export async function carregarLogos({ buscar = (u) => fetch(u, { cache: 'no-store' }), base = document.baseURI, medir = medirNoNavegador } = {}) {
  const ler = async (arquivo) => {
    try {
      const r = await buscar(new URL(arquivo, base).href);
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!TIPOS.test(blob.type) || blob.size === 0 || blob.size > MAX_BYTES) return null;
      const dim = await medir(blob);
      if (!(dim.largura > 0 && dim.altura > 0)) return null;
      const url = await blobParaDataUrl(blob);
      return { dados: url.replace(/^data:/, ''), largura: dim.largura, altura: dim.altura };
    } catch {
      return null;
    }
  };
  const [esquerda, direita] = await Promise.all([ler(ARQUIVOS_LOGO.esquerda), ler(ARQUIVOS_LOGO.direita)]);
  return { esquerda, direita };
}
