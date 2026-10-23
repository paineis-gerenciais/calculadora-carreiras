// Adaptador do Chart.js 4.5.1 (vendor/chartjs). Devolve a classe Chart.
import { carregarScript } from './carregar.js';

export const carregarChart = () => carregarScript('vendor/chartjs/4.5.1/chart.umd.min.js', 'Chart');
