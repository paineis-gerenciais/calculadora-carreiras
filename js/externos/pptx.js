// Adaptador da PptxGenJS 4.0.1 (vendor/pptxgenjs). Devolve o construtor. O arquivo é gerado com `write({ outputType: 'blob' })`
// e baixado por ui/download.js: o `writeFile` da biblioteca viola a CSP (style-src; parecer de segurança A10).
import { carregarScript } from './carregar.js';

export const carregarPptxGen = () => carregarScript('vendor/pptxgenjs/4.0.1/pptxgen.bundle.js', 'PptxGenJS');
