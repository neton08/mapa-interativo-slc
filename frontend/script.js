// Variáveis globais
let map; // Declarado UMA SÓ VEZ AQUI
let dadosOriginais = null;
let dadosFiltrados = null;
let camadasVisiveis = {
    especialistas: L.markerClusterGroup( ), 
    fazendas: L.layerGroup(),
    rotas: L.layerGroup(),
    areas: L.layerGroup()
};

// Cores para cada especialista
const coresEspecialistas = {
    'IGOR.DIAS': '#0ccf26ff', 'GIOVANI.CATAPAN': '#27ae60', 'ALYNE.SOUZA': '#3498db',
    'GENEZIO.NASCIMENTO': '#f39c12', 'NATALIA.NUNES': '#9b59b6', 'CARLOS.MAGALHAES': '#1abc9c',
    'FELIPHE.SANTOS': '#e91e1eff', 'FELIPE.AMORINI': '#1346cfff', 'EVANILSON.SANTANA': '#2c3e50',
    'EDGAR.NETO': '#7f8c8d', 'KETELLY.VIEIRA': '#ce1195ff'
};

// Camadas base
const camadasBase = {
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' } ),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' } ),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' } )
};

// --- FUNÇÕES AUXILIARES ---
function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6';
    const nomeNormalizado = String(nome).trim().toUpperCase();
     // ADICIONE ESTA LINHA PARA DEBUG:
    console.log(`Tentando obter cor para: "'${nomeNormalizado}'"`); 
    return coresEspecialistas[nomeNormalizado] || '#95a5a6';
}

function formatarDistancia(distanciaEmMetros) {
    if (isNaN(distanciaEmMetros)) return 'N/A';
    return (distanciaEmMetros / 1000).toFixed(1) + ' km';
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    inicializarMapa();
    carregarDados();
    configurarEventListeners();
});

function inicializarMapa() {
    map = L.map('map', { center: [-15.7, -47.9], zoom: 5, zoomControl: true });
    camadasBase.osm.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
}

async function carregarDados() {
    mostrarLoading(true);
    try {
        const response = await fetch('https://github.com/neton08/mapa-interativo-slc');
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        dadosOriginais = await response.json();
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais)); // Cópia profunda
        processarDados();
        preencherFiltros();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do mapa. Verifique o console (F12).');
    } finally {
        mostrarLoading(false);
    }
}

// --- PROCESSAMENTO E DESENHO ---
async function processarDados() {
    Object.values(camadasVisiveis).forEach(layer => layer.clearLayers());
    if (!dadosFiltrados) return;

    const fazendasAgrupadas = agruparFazendas(dadosFiltrados.fazendas);
    
    desenharFazendasEIcones(fazendasAgrupadas);
    desenharEspecialistas(fazendasAgrupadas);
    
    // A função desenharRotas agora vai RETORNAR a distância total calculada
    const distanciaTotalDasRotas = await desenharRotas(fazendasAgrupadas);

    desenharAreasAtuacao(fazendasAgrupadas);

    // Passamos o valor calculado para a função de atualizar estatísticas
    atualizarEstatisticas(fazendasAgrupadas, distanciaTotalDasRotas); 
    
    criarLegenda();
    ajustarVisualizacao(fazendasAgrupadas);
}

function agruparFazendas(listaDePoligonos) {
    const fazendas = {};
    listaDePoligonos.forEach(p => {
        if (!fazendas[p.nome]) {
            fazendas[p.nome] = {
                nome: p.nome,
                especialista: p.especialista,
                cidade_origem: p.cidade_origem,
                poligonos: [],
                centroides: []
            };
        }
        fazendas[p.nome].poligonos.push(p.geometria);
        fazendas[p.nome].centroides.push(p.centroide);
    });

    Object.values(fazendas).forEach(fazenda => {
        let latSum = 0, lngSum = 0;
        fazenda.centroides.forEach(c => { latSum += c[0]; lngSum += c[1]; });
        fazenda.centroideGeral = [latSum / fazenda.centroides.length, lngSum / fazenda.centroides.length];
    });
    return fazendas;
}

// ############# INÍCIO DA CORREÇÃO #############
function desenharFazendasEIcones(fazendasAgrupadas) {
    Object.values(fazendasAgrupadas).forEach(fazenda => {
        const cor = getCorEspecialista(fazenda.especialista);
        
        // Encontra a informação completa do especialista de forma segura
        const especialistaInfo = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
        
        let distanciaFormatada = 'N/A';
        // Calcula a distância apenas se a informação do especialista e suas coordenadas existirem
        if (especialistaInfo && especialistaInfo.latitude_base && especialistaInfo.longitude_base) {
            const pontoEspecialista = L.latLng(especialistaInfo.latitude_base, especialistaInfo.longitude_base);
            const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
            const distanciaMetros = map.distance(pontoEspecialista, pontoFazenda);
            distanciaFormatada = formatarDistancia(distanciaMetros);
        }

        // Desenha os polígonos da fazenda
        L.geoJSON(fazenda.poligonos, { 
            style: { fillColor: cor, weight: 1, opacity: 1, color: 'white', dashArray: '3', fillOpacity: 0.4 } 
        }).addTo(camadasVisiveis.fazendas);

        // Adiciona o ícone do trator com o pop-up corrigido
        L.marker(fazenda.centroideGeral, { icon: criarIconeFazenda(cor) })
            .bindPopup(`
                <h4>Fazenda: ${fazenda.nome}</h4>
                <p><strong>Cidade de Origem:</strong> ${fazenda.cidade_origem || 'N/A'}</p>
                <p><strong>Atendida por:</strong> ${fazenda.especialista}</p>
                <p><strong>Distância da Base:</strong> ${distanciaFormatada}</p>
            `)
            .addTo(camadasVisiveis.fazendas);
    });
}
// ############# FIM DA CORREÇÃO #############


function desenharEspecialistas(fazendasAgrupadas) {
    const fazendasPorEspecialista = {};
    Object.values(fazendasAgrupadas).forEach(f => {
        if (!fazendasPorEspecialista[f.especialista]) fazendasPorEspecialista[f.especialista] = [];
        fazendasPorEspecialista[f.especialista].push(f);
    });

    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = fazendasPorEspecialista[especialista.nome];
        if (!fazendasAtendidas || fazendasAtendidas.length === 0 || !especialista.latitude_base) return;

        const cor = getCorEspecialista(especialista.nome);
        const { maxDist, avgDist } = calcularDistancias(especialista, fazendasAtendidas);
        
        const listaFazendasHtml = fazendasAtendidas.map(f => `<li>${f.nome}</li>`).join('');

        L.marker([especialista.latitude_base, especialista.longitude_base], { icon: criarIconeEspecialista(cor) })
            .bindPopup(`
                <h4>Especialista: ${especialista.nome}</h4>
                <p><strong>Cidade Base:</strong> ${especialista.cidade_base || 'N/A'}</p>
                <p><strong>Raio Máximo:</strong> ${formatarDistancia(maxDist)}</p>
                <p><strong>Distância Média:</strong> ${formatarDistancia(avgDist)}</p>
                <p><strong>Unidades Atendidas (${fazendasAtendidas.length}):</strong></p>
                <ul style="margin-top: 5px; padding-left: 20px;">${listaFazendasHtml}</ul>
            `)
            .addTo(camadasVisiveis.especialistas);
    });
}

async function desenharRotas(fazendasAgrupadas) {
    const especialistas = dadosOriginais.especialistas.reduce((acc, e) => {
        if (e.latitude_base && e.longitude_base) {
            acc[e.nome] = { lat: e.latitude_base, lon: e.longitude_base };
        }
        return acc;
    }, {});

    let distanciaTotalAcumulada = 0; // Variável para somar as distâncias

    for (const fazenda of Object.values(fazendasAgrupadas)) {
        const especialistaInfo = especialistas[fazenda.especialista];
        if (especialistaInfo) {
            const cor = getCorEspecialista(fazenda.especialista);
            const start = `${especialistaInfo.lon},${especialistaInfo.lat}`;
            const end = `${fazenda.centroideGeral[1]},${fazenda.centroideGeral[0]}`;
            
            try {
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson` );
                if (!response.ok) throw new Error('Falha na API de roteamento');
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    L.geoJSON(data.routes[0].geometry, { style: { color: cor, weight: 4, opacity: 0.6 } }).addTo(camadasVisiveis.rotas);
                    // Soma a distância da rota (em metros) à nossa variável
                    distanciaTotalAcumulada += data.routes[0].distance; 
                } else { throw new Error('Nenhuma rota encontrada'); }
            } catch (error) {
                console.warn(`Fallback para linha reta para ${fazenda.nome}:`, error.message);
                const p1 = L.latLng(especialistaInfo.lat, especialistaInfo.lon);
                const p2 = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
                L.polyline([p1, p2], { color: cor, weight: 2, opacity: 0.6, dashArray: '5, 5' }).addTo(camadasVisiveis.rotas);
                // Soma a distância da linha reta também
                distanciaTotalAcumulada += map.distance(p1, p2);
            }
        }
    }
    // Retorna o valor final para quem a chamou
    return distanciaTotalAcumulada;
}

function desenharAreasAtuacao(fazendasAgrupadas) {
    const fazendasPorEspecialista = {};
    Object.values(fazendasAgrupadas).forEach(f => {
        if (!fazendasPorEspecialista[f.especialista]) fazendasPorEspecialista[f.especialista] = [];
        fazendasPorEspecialista[f.especialista].push(f);
    });

    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = fazendasPorEspecialista[especialista.nome];
        if (fazendasAtendidas && fazendasAtendidas.length > 0 && especialista.latitude_base) {
            const { maxDist } = calcularDistancias(especialista, fazendasAtendidas);
            const cor = getCorEspecialista(especialista.nome);
            L.circle([especialista.latitude_base, especialista.longitude_base], {
                color: cor, fillColor: cor, fillOpacity: 0.1, radius: maxDist, weight: 1.5, dashArray: '10, 10'
            }).addTo(camadasVisiveis.areas);
        }
    });
}

// --- ÍCONES E CÁLCULOS ---
function criarIconeEspecialista(cor) {
    return L.divIcon({ className: 'custom-marker', html: `<div style="background-color: ${cor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"><i class="fas fa-user"></i></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

function criarIconeFazenda(cor) {
    return L.divIcon({ className: 'custom-marker', html: `<div style="font-size: 24px; color: ${cor}; text-shadow: 0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white;"><i class="fas fa-tractor"></i></div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

function calcularDistancias(especialista, fazendas) {
    const distancias = fazendas.map(f => {
        const p1 = L.latLng(especialista.latitude_base, especialista.longitude_base);
        const p2 = L.latLng(f.centroideGeral[0], f.centroideGeral[1]);
        return map.distance(p1, p2);
    });
    const maxDist = Math.max(...distancias);
    const avgDist = distancias.reduce((a, b) => a + b, 0) / distancias.length;
    return { maxDist, avgDist };
}

// --- UI E EVENTOS ---
function atualizarEstatisticas(fazendasAgrupadas, distanciaTotal) {
    const totalUnidades = Object.keys(fazendasAgrupadas).length;
    document.getElementById('total-unidades').textContent = totalUnidades;
    document.getElementById('total-especialistas').textContent = new Set(Object.values(fazendasAgrupadas).map(f => f.especialista)).size;
    
    // Calcula a média usando o valor recebido
    const distanciaMedia = totalUnidades > 0 ? distanciaTotal / totalUnidades : 0;

    document.getElementById('distancia-media').textContent = formatarDistancia(distanciaMedia);
}

function criarLegenda() {
    const legendaContent = document.getElementById('legend-content');
    legendaContent.innerHTML = '';
    const contadores = {};
    const especialistasNosDados = new Set(dadosFiltrados.fazendas.map(f => f.especialista));
    
    especialistasNosDados.forEach(especialista => {
        if(especialista) {
            contadores[especialista] = new Set(dadosFiltrados.fazendas.filter(f => f.especialista === especialista).map(f => f.nome)).size;
        }
    });
    
    Object.entries(contadores).sort().forEach(([especialista, count]) => {
        const cor = getCorEspecialista(especialista);
        legendaContent.innerHTML += `<div class="legend-item"><div class="legend-color" style="background-color: ${cor};"></div><span>${especialista}</span><span class="legend-count">(${count})</span></div>`;
    });
}

function aplicarFiltros() {
    if (!dadosOriginais) return;
    const gestorSel = document.getElementById('gestor-filter').value;
    const especialistaSel = document.getElementById('especialista-filter').value;
    
    let especialistasFiltradosNomes = dadosOriginais.especialistas.map(e => e.nome);
    if (gestorSel) {
        especialistasFiltradosNomes = dadosOriginais.especialistas.filter(e => e.gestor === gestorSel).map(e => e.nome);
    }
    
    dadosFiltrados.fazendas = dadosOriginais.fazendas.filter(f => {
        const porEspecialista = especialistaSel ? f.especialista === especialistaSel : true;
        const porGestor = gestorSel ? especialistasFiltradosNomes.includes(f.especialista) : true;
        return porEspecialista && porGestor;
    });
    processarDados();
}

function configurarEventListeners() {
    document.getElementById('gestor-filter').addEventListener('change', aplicarFiltros);
    document.getElementById('especialista-filter').addEventListener('change', aplicarFiltros);
    document.getElementById('resetar-filtros').addEventListener('click', () => {
        document.getElementById('gestor-filter').value = '';
        document.getElementById('especialista-filter').value = '';
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
        processarDados();
    });
    
    document.querySelectorAll('input[name="base-layer"]').forEach(radio => radio.addEventListener('change', function() {
        Object.values(camadasBase).forEach(camada => map.removeLayer(camada));
        camadasBase[this.value].addTo(map);
    }));
    
    document.getElementById('show-colaboradores').addEventListener('change', e => toggleLayer(camadasVisiveis.especialistas, e.target.checked));
    document.getElementById('show-fazendas').addEventListener('change', e => toggleLayer(camadasVisiveis.fazendas, e.target.checked));
    document.getElementById('show-rotas').addEventListener('change', e => toggleLayer(camadasVisiveis.rotas, e.target.checked));
    document.getElementById('show-areas').addEventListener('change', e => toggleLayer(camadasVisiveis.areas, e.target.checked));
    
    // ... outros event listeners ...
}

function preencherFiltros() {
    if (!dadosOriginais) return;
    const gestorSelect = document.getElementById('gestor-filter');
    const especialistaSelect = document.getElementById('especialista-filter');
    gestorSelect.innerHTML = '<option value="">Todos</option>';
    especialistaSelect.innerHTML = '<option value="">Todos</option>';
    [...new Set(dadosOriginais.especialistas.map(e => e.gestor))].filter(Boolean).sort().forEach(g => gestorSelect.add(new Option(g, g)));
    [...new Set(dadosOriginais.fazendas.map(f => f.especialista))].filter(Boolean).sort().forEach(e => especialistaSelect.add(new Option(e, e)));
}

function toggleLayer(layer, isVisible) {
    if (isVisible) map.addLayer(layer); else map.removeLayer(layer);
}

function ajustarVisualizacao(fazendasAgrupadas) {
    const bounds = new L.LatLngBounds();
    Object.values(fazendasAgrupadas).forEach(f => bounds.extend(f.centroideGeral));
    dadosOriginais.especialistas.forEach(e => {
        if (e.latitude_base && e.longitude_base && dadosFiltrados.fazendas.some(f => f.especialista === e.nome)) {
            bounds.extend([e.latitude_base, e.longitude_base]);
        }
    });
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
}

function mostrarLoading(mostrar) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !mostrar);
}