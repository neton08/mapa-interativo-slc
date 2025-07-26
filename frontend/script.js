// ===================================================================
//  ARQUIVO: script.js (VERSÃO MODERNIZADA)
// ===================================================================

document.addEventListener('DOMContentLoaded', inicializarAplicacao);

// --- CONFIGURAÇÃO DAS APIS ---
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDGlKNbAUAiCq7JznLqXlEHpgo1r7ioJW_NsPABBY5hrR_0njMU93eSfGJZeMCouqdQg/exec';
const GEOAPIFY_API_KEY = 'b1d923c55b2b494d868970c34534145b'; // Chave pública de exemplo da Geoapify

// --- VARIÁVEIS GLOBAIS ---
let map;
let dadosOriginais = null;
let dadosFiltrados = null;
let camadasVisiveis = {
    especialistas: L.markerClusterGroup({
        iconCreateFunction: function(cluster ) {
            const childCount = cluster.getChildCount();
            let size = 32 + (childCount / 10) * 5; // Aumenta o tamanho com base no número
            return L.divIcon({
                html: `<div class="custom-marker-icon especialista" style="background-color: #34495e; width: ${size}px; height: ${size}px;">${childCount}</div>`,
                className: '',
                iconSize: [size, size]
            });
        }
    }),
    fazendas: L.layerGroup(),
    rotas: L.layerGroup(),
    areas: L.layerGroup()
};
let coresEspecialistas = {};

// --- INICIALIZAÇÃO ---
function inicializarAplicacao() {
    mostrarLoading(true);
    inicializarMapa();
    configurarEventListeners();
    carregarDados();
}

function inicializarMapa() {
    map = L.map('map', {
        center: [-15.7, -47.9],
        zoom: 4,
        zoomControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    } ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
}

// --- CARREGAMENTO E PROCESSAMENTO DE DADOS ---
async function carregarDados() {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) throw new Error(`Erro na rede: ${response.statusText}`);
        const data = await response.json();

        dadosOriginais = processarDadosIniciais(data);
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais)); // Cópia profunda inicial

        preencherFiltros();
        atualizarVisualizacao();

    } catch (error) {
        console.error("Falha ao carregar dados:", error);
        alert("Não foi possível carregar os dados do mapa. Verifique sua conexão e a URL da API.");
    } finally {
        mostrarLoading(false);
    }
}

function processarDadosIniciais(rawData) {
    const especialistasMap = new Map();
    const fazendas = [];

    rawData.forEach(item => {
        if (!item.ESPECIALISTA || !item.COORDENADAS_CIDADE || !item.COORDENADAS_UNIDADE) return;

        try {
            if (!especialistasMap.has(item.ESPECIALISTA)) {
                const [lat, lon] = item.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
                if (isNaN(lat) || isNaN(lon)) return;
                especialistasMap.set(item.ESPECIALISTA, {
                    nome: item.ESPECIALISTA,
                    gestor: item.GESTOR,
                    cidade_base: item.CIDADE_BASE,
                    latLngBase: { lat, lng: lon }, // Armazenar como objeto simples para JSON.stringify
                    unidadesAtendidas: []
                });
            }

            const [lat, lon] = item.COORDENADAS_UNIDADE.split(',').map(c => parseFloat(c.trim()));
            if (isNaN(lat) || isNaN(lon)) return;

            const fazenda = {
                nome: item.UNIDADE,
                grupo: item.GRUPO || 'Não informado',
                especialista: item.ESPECIALISTA,
                latLng: { lat, lng: lon } // Armazenar como objeto simples
            };
            fazendas.push(fazenda);
            especialistasMap.get(item.ESPECIALISTA).unidadesAtendidas.push(fazenda.nome);

        } catch (e) {
            console.warn("Erro ao processar item:", item, e);
        }
    });

    return {
        especialistas: Array.from(especialistasMap.values()),
        fazendas: fazendas
    };
}

// --- ATUALIZAÇÃO DA VISUALIZAÇÃO ---
function atualizarVisualizacao() {
    Object.values(camadasVisiveis).forEach(layer => layer.clearLayers());

    if (!dadosFiltrados) return;

    // Recriar objetos LatLng a partir dos dados filtrados
    const fazendasComLatLng = dadosFiltrados.fazendas.map(f => ({ ...f, latLng: L.latLng(f.latLng.lat, f.latLng.lng) }));
    const especialistasComLatLng = dadosFiltrados.especialistas.map(e => ({ ...e, latLngBase: L.latLng(e.latLngBase.lat, e.latLngBase.lng) }));

    desenharFazendas(fazendasComLatLng);
    desenharEspecialistas(especialistasComLatLng);
    desenharRotas(especialistasComLatLng, fazendasComLatLng);
    desenharAreasAtuacao(especialistasComLatLng, fazendasComLatLng);

    criarLegenda(dadosFiltrados.especialistas);
    ajustarZoom();
}

// --- FUNÇÕES DE DESENHO NO MAPA ---
function desenharFazendas(fazendas) {
    fazendas.forEach(fazenda => {
        const cor = getCorEspecialista(fazenda.especialista);
        const icon = L.divIcon({
            html: `<div class="custom-marker-icon fazenda" style="background-color: ${cor};"><i class="fa-solid fa-tractor"></i></div>`,
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        L.marker(fazenda.latLng, { icon })
            .addTo(camadasVisiveis.fazendas)
            .on('click', () => mostrarInfoPanel(fazenda));
    });
}

function desenharEspecialistas(especialistas) {
    especialistas.forEach(especialista => {
        if (especialista.unidadesAtendidas.length === 0) return;
        const cor = getCorEspecialista(especialista.nome);
        const icon = L.divIcon({
            html: `<div class="custom-marker-icon especialista" style="background-color: ${cor};"><i class="fa-solid fa-user"></i></div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        L.marker(especialista.latLngBase, { icon }).addTo(camadasVisiveis.especialistas);
    });
}

function desenharRotas(especialistas, fazendas) {
    const especialistaMap = new Map(especialistas.map(e => [e.nome, e]));

    fazendas.forEach(fazenda => {
        const especialista = especialistaMap.get(fazenda.especialista);
        if (especialista) {
            const cor = getCorEspecialista(especialista.nome);
            L.polyline([especialista.latLngBase, fazenda.latLng], {
                color: cor,
                weight: 2,
                opacity: 0.5,
                dashArray: '5, 5'
            }).addTo(camadasVisiveis.rotas);
        }
    });
}

function desenharAreasAtuacao(especialistas, fazendas) {
    const fazendaMap = new Map(fazendas.map(f => [f.nome, f]));

    especialistas.forEach(especialista => {
        const distancias = especialista.unidadesAtendidas
            .map(nomeFazenda => fazendaMap.get(nomeFazenda))
            .filter(Boolean)
            .map(fazenda => especialista.latLngBase.distanceTo(fazenda.latLng));

        if (distancias.length > 0) {
            const maxDist = Math.max(...distancias);
            const cor = getCorEspecialista(especialista.nome);
            L.circle(especialista.latLngBase, {
                radius: maxDist,
                color: cor,
                fillColor: cor,
                fillOpacity: 0.08,
                weight: 1.5
            }).addTo(camadasVisiveis.areas);
        }
    });
}

// --- PAINEL DE INFORMAÇÕES (POP-UP MODERNO) ---
async function mostrarInfoPanel(fazenda) {
    const infoPanel = document.getElementById('info-panel');
    const contentDiv = document.getElementById('info-panel-content');
    contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Carregando detalhes...</p></div>';
    infoPanel.classList.add('visible');

    const especialista = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
    if (!especialista) return;

    const especialistaLatLng = L.latLng(especialista.latLngBase.lat, especialista.latLngBase.lng);

    // Busca cidade mais próxima
    const cidadeProximaInfo = await getCidadeMaisProxima(fazenda.latLng);
    
    // Calcula distâncias e tempos
    const distBaseUnidade = especialistaLatLng.distanceTo(fazenda.latLng);
    const distCidadeProximaUnidade = cidadeProximaInfo.distancia;
    const tempoDeslocamento = (distBaseUnidade / 1000) / 70; // Média de 70 km/h

    const raioAtuacao = Math.max(...especialista.unidadesAtendidas
        .map(nome => dadosOriginais.fazendas.find(f => f.nome === nome))
        .filter(Boolean)
        .map(f => especialistaLatLng.distanceTo(L.latLng(f.latLng.lat, f.latLng.lng))));

    contentDiv.innerHTML = `
        <h3><i class="fa-solid fa-tractor" style="color: ${getCorEspecialista(especialista.nome)};"></i> ${fazenda.nome}</h3>
        <p class="sub-header">Grupo: ${fazenda.grupo}</p>

        <div class="info-section">
            <h4><i class="fa-solid fa-route"></i> Informações da Rota</h4>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-map-pin"></i> Da Base à Unidade</span>
                <span class="value">${formatarDistancia(distBaseUnidade)}</span>
            </div>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-city"></i> Da Cid. Próxima à Unidade</span>
                <span class="value">${formatarDistancia(distCidadeProximaUnidade)}</span>
            </div>
             <div class="info-item">
                <span class="label"><i class="fa-solid fa-clock"></i> Tempo de Deslocamento</span>
                <span class="value">${formatarTempo(tempoDeslocamento)}</span>
            </div>
        </div>

        <div class="info-section">
            <h4><i class="fa-solid fa-user-check"></i> Atendimento</h4>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-user"></i> Especialista</span>
                <span class="value">${especialista.nome}</span>
            </div>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-street-view"></i> Cidade Base</span>
                <span class="value">${especialista.cidade_base}</span>
            </div>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-compass-drafting"></i> Raio de Atuação</span>
                <span class="value">${formatarDistancia(raioAtuacao)}</span>
            </div>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-warehouse"></i> Unidades Atendidas</span>
                <span class="value">${especialista.unidadesAtendidas.length}</span>
            </div>
        </div>
        
        <div class="info-section">
            <h4><i class="fa-solid fa-location-dot"></i> Localização</h4>
            <div class="info-item">
                <span class="label"><i class="fa-solid fa-city"></i> Cidade Mais Próxima</span>
                <span class="value">${cidadeProximaInfo.nome}</span>
            </div>
        </div>
    `;
}

function esconderInfoPanel() {
    document.getElementById('info-panel').classList.remove('visible');
}

// --- FILTROS E EVENTOS ---
function configurarEventListeners() {
    document.getElementById('gestor-filter').addEventListener('change', aplicarFiltros);
    document.getElementById('especialista-filter').addEventListener('change', aplicarFiltros);
    document.getElementById('resetar-filtros').addEventListener('click', resetarFiltros);
    document.getElementById('close-info-panel').addEventListener('click', esconderInfoPanel);
    document.getElementById('toggle-legend').addEventListener('click', toggleLegenda);

    document.querySelectorAll('.layer-group input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const layerId = e.target.id.replace('show-', '');
            toggleLayer(camadasVisiveis[layerId], e.target.checked);
        });
    });
}

function preencherFiltros() {
    const gestorSelect = document.getElementById('gestor-filter');
    const especialistaSelect = document.getElementById('especialista-filter');
    
    const gestores = [...new Set(dadosOriginais.especialistas.map(e => e.gestor))].filter(Boolean).sort();
    const especialistas = [...new Set(dadosOriginais.especialistas.map(e => e.nome))].filter(Boolean).sort();

    gestorSelect.innerHTML = '<option value="">Todos os Gestores</option>';
    especialistaSelect.innerHTML = '<option value="">Todos os Especialistas</option>';

    gestores.forEach(g => gestorSelect.add(new Option(g, g)));
    especialistas.forEach(e => especialistaSelect.add(new Option(e, e)));
}

function aplicarFiltros() {
    const gestorSel = document.getElementById('gestor-filter').value;
    const especialistaSel = document.getElementById('especialista-filter').value;

    let especialistasFiltrados = dadosOriginais.especialistas;

    if (gestorSel) {
        especialistasFiltrados = especialistasFiltrados.filter(e => e.gestor === gestorSel);
    }
    if (especialistaSel) {
        especialistasFiltrados = especialistasFiltrados.filter(e => e.nome === especialistaSel);
    }

    const nomesEspecialistasFiltrados = new Set(especialistasFiltrados.map(e => e.nome));
    const fazendasFiltradas = dadosOriginais.fazendas.filter(f => nomesEspecialistasFiltrados.has(f.especialista));

    dadosFiltrados = {
        especialistas: especialistasFiltrados,
        fazendas: fazendasFiltradas
    };

    atualizarVisualizacao();
}

function resetarFiltros() {
    document.getElementById('gestor-filter').value = '';
    document.getElementById('especialista-filter').value = '';
    dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
    atualizarVisualizacao();
    esconderInfoPanel();
}

// --- FUNÇÕES UTILITÁRIAS ---
function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6';
    if (coresEspecialistas[nome]) return coresEspecialistas[nome];

    let hash = 0;
    for (let i = 0; i < nome.length; i++) {
        hash = nome.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    const novaCor = `hsl(${h}, 70%, 50%)`;
    coresEspecialistas[nome] = novaCor;
    return novaCor;
}

async function getCidadeMaisProxima(latLng) {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${latLng.lat}&lon=${latLng.lng}&type=city&apiKey=${GEOAPIFY_API_KEY}`;
    try {
        const response = await fetch(url );
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const cidade = data.features[0].properties;
            const cidadeLatLng = L.latLng(cidade.lat, cidade.lon);
            return {
                nome: `${cidade.city}, ${cidade.state_code}`,
                distancia: latLng.distanceTo(cidadeLatLng)
            };
        }
        return { nome: 'Não encontrada', distancia: 0 };
    } catch (error) {
        console.error("Erro ao buscar cidade mais próxima:", error);
        return { nome: 'Erro na busca', distancia: 0 };
    }
}

function formatarDistancia(metros) {
    if (isNaN(metros)) return 'N/A';
    return (metros / 1000).toFixed(1) + ' km';
}

function formatarTempo(horas) {
    if (isNaN(horas)) return 'N/A';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h ${m}min`;
}

function toggleLayer(layer, isVisible) {
    if (isVisible) {
        map.addLayer(layer);
    } else {
        map.removeLayer(layer);
    }
}

function ajustarZoom() {
    const bounds = new L.LatLngBounds();
    dadosFiltrados.fazendas.forEach(f => bounds.extend(f.latLng));
    dadosFiltrados.especialistas.forEach(e => bounds.extend(e.latLngBase));

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
}

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = mostrar ? 'flex' : 'none';
}

function criarLegenda(especialistas) {
    const content = document.getElementById('legend-content');
    content.innerHTML = '';
    especialistas.forEach(especialista => {
        const cor = getCorEspecialista(especialista.nome);
        const count = especialista.unidadesAtendidas.length;
        if (count > 0) {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color" style="background-color: ${cor};"></div>
                <span>${especialista.nome}</span>
                <span class="legend-count">(${count})</span>
            `;
            content.appendChild(item);
        }
    });
}

function toggleLegenda() {
    const content = document.getElementById('legend-content');
    const icon = document.querySelector('#toggle-legend i');
    content.classList.toggle('collapsed');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}
