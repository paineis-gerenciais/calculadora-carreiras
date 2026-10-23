// Download de um arquivo gerado no navegador. Usa propriedades do elemento (nunca setAttribute com href): a CSP
// style-src 'self' não admite style embutido, então o link fica oculto pelo atributo hidden.
export function baixar(nomeArquivo, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
