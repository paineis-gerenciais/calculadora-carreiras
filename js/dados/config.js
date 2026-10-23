// Configuração web do Firebase usada SÓ na cópia publicada (repositório paineis-gerenciais/calculadora-carreiras).
// Ao publicar, este arquivo substitui app/js/dados/config.js (o de app/ continua de demonstração, e o teste
// testes/unit/renderizacao-segura.test.mjs garante que app/ não contém chave real).
// A configuração web é pública por natureza: identifica o projeto. Quem protege os dados são as regras do
// Firestore (firestore.rules) e a restrição da chave ao endereço do site (opcional O4, no console do Google Cloud).
// Fornecida pelo usuário em 23/10/2026 (G3). Projeto: calculadora-carreiras (plano Spark, sem faturamento).
export const PRODUCAO_CONFIGURADA = true;

export const firebaseConfig = {
  apiKey: 'AIzaSyBcRTq6L5r_lXF4UeW77TBcgqvMfJIVovw',
  authDomain: 'calculadora-carreiras.firebaseapp.com',
  projectId: 'calculadora-carreiras',
  storageBucket: 'calculadora-carreiras.firebasestorage.app',
  messagingSenderId: '958173501395',
  appId: '1:958173501395:web:6db6fc2d3304f3cb384126',
};

export default firebaseConfig;
