// ===================================================================
//  ARQUIVO: script.js (VERSÃO CORRIGIDA COM TODAS AS FUNCIONALIDADES)
// ===================================================================

document.addEventListener('DOMContentLoaded', inicializarAplicacao);

// --- CONFIGURAÇÃO ---
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDGlKNbAUAiCq7JznLqXlEHpgo1r7ioJW_NsPABBY5hrR_0njMU93eSfGJZeMCouqdQg/exec';

// --- VARIÁVEIS GLOBAIS ---
let map;
let dadosOriginais = null;
let dadosFiltrados = null;
let cidadesBrasil = null; // Para armazenar dados do GeoJSON
let camadasVisiveis = {
    especialistas: L.markerClusterGroup({
        iconCreateFunction: cluster => L.divIcon({ 
            html: `<div class="custom-marker-icon especialista" style="background-color: #34495e;">${cluster.getChildCount()}</div>`, 
            className: '', 
            iconSize: [32, 32] 
        })
    }),
    fazendas: L.layerGroup(),
    rotas: L.layerGroup(),
    areas: L.layerGroup()
};
let coresEspecialistas = {};

// --- INICIALIZAÇÃO ---
function inicializarAplicacao() {
    console.log("Iniciando aplicação...");
    mostrarLoading(true);
    inicializarMapa();
    configurarEventListeners();
    carregarCidadesBrasil().then(() => {
        carregarDados();
    });
}

function inicializarMapa() {
    console.log("Inicializando mapa...");
    map = L.map('map', { center: [-15.7, -47.9], zoom: 4, zoomControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
    console.log("Mapa inicializado.");
}

// --- CARREGAMENTO DE DADOS ---
async function carregarCidadesBrasil() {
    try {
        console.log("Carregando dados das cidades brasileiras...");
        const response = await fetch('./cidadebrasil.geojson');
        if (!response.ok) throw new Error(`Erro ao carregar GeoJSON: ${response.statusText}`);
        cidadesBrasil = await response.json();
        console.log(`${cidadesBrasil.features.length} cidades carregadas.`);
    } catch (error) {
        console.error("Erro ao carregar cidades:", error);
        cidadesBrasil = null;
    }
}

async function carregarDados() {
    console.log("Buscando dados da API do Google...");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) {
            throw new Error(`Erro na rede: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Dados recebidos:", data);

        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error("Os dados recebidos estão vazios ou em formato inválido.");
        }

        dadosOriginais = processarDadosIniciais(data);
        if (!dadosOriginais || dadosOriginais.especialistas.length === 0) {
             throw new Error("Nenhum dado válido foi processado. Verifique a planilha.");
        }
        
        console.log("Dados processados:", dadosOriginais);
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));

        preencherFiltros();
        atualizarVisualizacao();

    } catch (error) {
        console.error("Falha crítica ao carregar ou processar dados:", error);
        alert(`ERRO: ${error.message}. Verifique o console (F12) para mais detalhes.`);
    } finally {
        mostrarLoading(false);
    }
}

function processarDadosIniciais(rawData) {
    console.log("Processando dados brutos...");
    const especialistasMap = new Map();
    const fazendas = [];

    rawData.forEach((item, index) => {
        if (!item.ESPECIALISTA || !item.COORDENADAS_CIDADE || !item.COORDENADAS_UNIDADE) {
            console.warn(`Linha ${index + 1} ignorada: faltam dados essenciais.`, item);
            return;
        }

        try {
            if (!especialistasMap.has(item.ESPECIALISTA)) {
                const [lat, lon] = item.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
                if (isNaN(lat) || isNaN(lon)) throw new Error("Coordenadas da cidade base inválidas.");
                
                especialistasMap.set(item.ESPECIALISTA, {
                    nome: item.ESPECIALISTA,
                    gestor: item.GESTOR || 'Não informado',
                    cidade_base: item.CIDADE_BASE || 'Não informada',
                    latLngBase: { lat, lng: lon },
                    unidadesAtendidas: []
                });
            }

            const [lat, lon] = item.COORDENADAS_UNIDADE.split(',').map(c => parseFloat(c.trim()));
            if (isNaN(lat) || isNaN(lon)) throw new Error("Coordenadas da unidade inválidas.");

            const fazenda = {
                nome: item.UNIDADE,
                grupo: item.GRUPO || 'Não informado',
                especialista: item.ESPECIALISTA,
                latLng: { lat, lng: lon }
            };
            fazendas.push(fazenda);
            especialistasMap.get(item.ESPECIALISTA).unidadesAtendidas.push(fazenda.nome);

        } catch (e) {
            console.warn(`Erro ao processar linha ${index + 1}: ${e.message}`, item);
        }
    });

    return {
        especialistas: Array.from(especialistasMap.values()),
        fazendas: fazendas
    };
}

// --- ATUALIZAÇÃO DA INTERFACE ---
function atualizarVisualizacao() {
    console.log("Atualizando visualização no mapa...");
    Object.values(camadasVisiveis).forEach(layer => layer.clearLayers());

    if (!dadosFiltrados) {
        console.warn("Tentativa de atualizar visualização sem dados filtrados.");
        return;
    }

    const fazendasComLatLng = dadosFiltrados.fazendas.map(f => ({ ...f, latLng: L.latLng(f.latLng.lat, f.latLng.lng) }));
    const especialistasComLatLng = dadosFiltrados.especialistas.map(e => ({ ...e, latLngBase: L.latLng(e.latLngBase.lat, e.latLngBase.lng) }));

    desenharFazendas(fazendasComLatLng);
    desenharEspecialistas(especialistasComLatLng);
    desenharRotasComEstradas(especialistasComLatLng, fazendasComLatLng);
    desenharAreasAtuacao(especialistasComLatLng, fazendasComLatLng);

    criarLegenda(dadosFiltrados.especialistas);
    ajustarZoom();
    console.log("Visualização atualizada.");
}

// --- FUNÇÕES DE DESENHO ---
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
            .on('click', () => mostrarInfoPanelFazenda(fazenda));
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
        L.marker(especialista.latLngBase, { icon })
            .addTo(camadasVisiveis.especialistas)
            .on('click', () => mostrarInfoPanelEspecialista(especialista));
    });
}

// NOVA FUNÇÃO: Desenhar rotas que seguem estradas usando Leaflet Routing Machine
function desenharRotasComEstradas(especialistas, fazendas) {
    const especialistaMap = new Map(especialistas.map(e => [e.nome, e]));
    
    fazendas.forEach(fazenda => {
        const especialista = especialistaMap.get(fazenda.especialista);
        if (especialista) {
            const cor = getCorEspecialista(especialista.nome);
            
            // Usar Leaflet Routing Machine para criar rota que segue estradas
            const routingControl = L.Routing.control({
                waypoints: [
                    L.latLng(especialista.latLngBase.lat, especialista.latLngBase.lng),
                    L.latLng(fazenda.latLng.lat, fazenda.latLng.lng)
                ],
                routeWhileDragging: false,
                addWaypoints: false,
                createMarker: function() { return null; }, // Não criar marcadores
                lineOptions: {
                    styles: [{ color: cor, weight: 3, opacity: 0.7 }]
                },
                show: false, // Não mostrar instruções
                collapsible: false
            });
            
            routingControl.addTo(camadasVisiveis.rotas);
        }
    });
}

function desenharAreasAtuacao(especialistas, fazendas) {
    const fazendaMap = new Map(fazendas.map(f => [f.nome, f]));
    
    especialistas.forEach(especialista => {
        const distancias = especialista.unidadesAtendidas
            .map(nome => fazendaMap.get(nome))
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

// --- PAINÉIS DE INFORMAÇÕES ---
async function mostrarInfoPanelFazenda(fazenda) {
    const infoPanel = document.getElementById('info-panel');
    const contentDiv = document.getElementById('info-panel-content');
    contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Carregando detalhes...</p></div>';
    infoPanel.classList.add('visible');

    const especialista = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
    if (!especialista) return;

    const especialistaLatLng = L.latLng(especialista.latLngBase.lat, especialista.latLngBase.lng);
    const cidadeProximaInfo = await getCidadeMaisProxima(fazenda.latLng);
    const distBaseUnidade = especialistaLatLng.distanceTo(fazenda.latLng);
    const tempoDeslocamento = (distBaseUnidade / 1000) / 70; // Média de 70 km/h
    const raioAtuacao = Math.max(0, ...especialista.unidadesAtendidas
        .map(nome => dadosOriginais.fazendas.find(f => f.nome === nome))
        .filter(Boolean)
        .map(f => especialistaLatLng.distanceTo(L.latLng(f.latLng.lat, f.latLng.lng))));

    contentDiv.innerHTML = `
        <h3><i class="fa-solid fa-tractor" style="color: ${getCorEspecialista(especialista.nome)};"></i> ${fazenda.nome}</h3>
        <p class="sub-header">Grupo: ${fazenda.grupo}</p>
        <div class="info-section"><h4><i class="fa-solid fa-route"></i> Rota</h4>
            <div class="info-item"><span class="label"><i class="fa-solid fa-map-pin"></i> Base à Unidade</span><span class="value">${formatarDistancia(distBaseUnidade)}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-city"></i> Cid. Próxima à Unidade</span><span class="value">${formatarDistancia(cidadeProximaInfo.distancia)}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-clock"></i> Tempo Estimado</span><span class="value">${formatarTempo(tempoDeslocamento)}</span></div>
        </div>
        <div class="info-section"><h4><i class="fa-solid fa-user-check"></i> Atendimento</h4>
            <div class="info-item"><span class="label"><i class="fa-solid fa-user"></i> Especialista</span><span class="value">${especialista.nome}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-street-view"></i> Cidade Base</span><span class="value">${especialista.cidade_base}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-compass-drafting"></i> Raio de Atuação</span><span class="value">${formatarDistancia(raioAtuacao)}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-warehouse"></i> Unidades Atendidas</span><span class="value">${especialista.unidadesAtendidas.length}</span></div>
        </div>
        <div class="info-section"><h4><i class="fa-solid fa-location-dot"></i> Localização</h4>
            <div class="info-item"><span class="label"><i class="fa-solid fa-city"></i> Cidade Mais Próxima</span><span class="value">${cidadeProximaInfo.nome}</span></div>
        </div>`;
}

// NOVA FUNÇÃO: Mostrar informações do especialista
async function mostrarInfoPanelEspecialista(especialista) {
    const infoPanel = document.getElementById('info-panel');
    const contentDiv = document.getElementById('info-panel-content');
    contentDiv.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Carregando detalhes...</p></div>';
    infoPanel.classList.add('visible');

    const especialistaLatLng = L.latLng(especialista.latLngBase.lat, especialista.latLngBase.lng);
    
    // Calcular estatísticas
    const fazendasAtendidas = dadosOriginais.fazendas.filter(f => f.especialista === especialista.nome);
    const distancias = fazendasAtendidas.map(f => especialistaLatLng.distanceTo(L.latLng(f.latLng.lat, f.latLng.lng)));
    const raioAtuacao = distancias.length > 0 ? Math.max(...distancias) : 0;
    const mediaKm = distancias.length > 0 ? distancias.reduce((a, b) => a + b, 0) / distancias.length : 0;

    // Lista de unidades atendidas
    const listaUnidades = fazendasAtendidas.map(f => `<li>${f.nome}</li>`).join('');

    contentDiv.innerHTML = `
        <h3><i class="fa-solid fa-user" style="color: ${getCorEspecialista(especialista.nome)};"></i> ${especialista.nome}</h3>
        <p class="sub-header">Gestor: ${especialista.gestor}</p>
        
        <div class="info-section"><h4><i class="fa-solid fa-chart-line"></i> Estatísticas</h4>
            <div class="info-item"><span class="label"><i class="fa-solid fa-compass-drafting"></i> Raio de Atuação</span><span class="value">${formatarDistancia(raioAtuacao)}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-calculator"></i> Média de KM</span><span class="value">${formatarDistancia(mediaKm)}</span></div>
            <div class="info-item"><span class="label"><i class="fa-solid fa-warehouse"></i> Unidades Atendidas</span><span class="value">${fazendasAtendidas.length}</span></div>
        </div>
        
        <div class="info-section"><h4><i class="fa-solid fa-map-location-dot"></i> Base</h4>
            <div class="info-item"><span class="label"><i class="fa-solid fa-street-view"></i> Cidade Base</span><span class="value">${especialista.cidade_base}</span></div>
        </div>
        
        <div class="info-section"><h4><i class="fa-solid fa-list"></i> Unidades Atendidas</h4>
            <ul style="margin-top: 10px; padding-left: 20px; max-height: 200px; overflow-y: auto;">${listaUnidades}</ul>
        </div>`;
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
    document.getElementById('adicionar-gestor-btn').addEventListener('click', abrirModalAdicionarGestor);
    
    // Modal
    document.querySelector('.close-modal-btn').addEventListener('click', fecharModalAdicionarGestor);
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('add-gestor-modal')) {
            fecharModalAdicionarGestor();
        }
    });
    
    document.querySelectorAll('.layer-group input[type="checkbox"]').forEach(cb => 
        cb.addEventListener('change', e => toggleLayer(camadasVisiveis[e.target.id.replace('show-', '')], e.target.checked))
    );
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

// --- MODAL PARA ADICIONAR GESTOR ---
function abrirModalAdicionarGestor() {
    const modal = document.getElementById('add-gestor-modal');
    const container = document.getElementById('add-gestor-form-container');
    
    // Renderizar formulário React
    const formElement = React.createElement(FormularioAdicionarGestor, {
        onSubmit: handleAdicionarGestor,
        onCancel: fecharModalAdicionarGestor
    });
    
    ReactDOM.render(formElement, container);
    modal.style.display = 'block';
}

function fecharModalAdicionarGestor() {
    document.getElementById('add-gestor-modal').style.display = 'none';
}

async function handleAdicionarGestor(dadosFormulario) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'addEntrada', ...dadosFormulario })
        });
        
        alert('Entrada adicionada com sucesso! A página será recarregada para mostrar a atualização.');
        window.location.reload();
    } catch (error) {
        console.error('Erro ao adicionar entrada:', error);
        alert('Ocorreu um erro ao adicionar a entrada.');
    }
}

// --- COMPONENTE REACT PARA FORMULÁRIO ---
function FormularioAdicionarGestor({ onSubmit, onCancel }) {
    const [formData, setFormData] = React.useState({
        GESTOR: '',
        ESPECIALISTA: '',
        CIDADE_BASE: '',
        COORDENADAS_CIDADE: '',
        UNIDADE: '',
        COORDENADAS_UNIDADE: '',
        GRUPO: ''
    });
    const [loading, setLoading] = React.useState(false);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        await onSubmit(formData);
        setLoading(false);
    };

    return React.createElement('div', { className: 'form-container' },
        React.createElement('h2', null, 'Adicionar Nova Entrada'),
        React.createElement('form', { onSubmit: handleSubmit },
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Gestor:'),
                React.createElement('input', {
                    type: 'text',
                    name: 'GESTOR',
                    value: formData.GESTOR,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Nome do gestor'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Especialista:'),
                React.createElement('input', {
                    type: 'text',
                    name: 'ESPECIALISTA',
                    value: formData.ESPECIALISTA,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Nome do especialista'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Cidade Base:'),
                React.createElement('input', {
                    type: 'text',
                    name: 'CIDADE_BASE',
                    value: formData.CIDADE_BASE,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Cidade de atuação'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Coordenadas da Cidade (lat, lng):'),
                React.createElement('input', {
                    type: 'text',
                    name: 'COORDENADAS_CIDADE',
                    value: formData.COORDENADAS_CIDADE,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Ex: -18.78, -52.60'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Unidade/Fazenda:'),
                React.createElement('input', {
                    type: 'text',
                    name: 'UNIDADE',
                    value: formData.UNIDADE,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Nome da fazenda/unidade'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Coordenadas da Unidade (lat, lng):'),
                React.createElement('input', {
                    type: 'text',
                    name: 'COORDENADAS_UNIDADE',
                    value: formData.COORDENADAS_UNIDADE,
                    onChange: handleChange,
                    required: true,
                    placeholder: 'Ex: -18.78, -52.60'
                })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, 'Grupo:'),
                React.createElement('input', {
                    type: 'text',
                    name: 'GRUPO',
                    value: formData.GRUPO,
                    onChange: handleChange,
                    placeholder: 'Nome do grupo (opcional)'
                })
            ),
            React.createElement('div', { style: { display: 'flex', gap: '10px' } },
                React.createElement('button', {
                    type: 'submit',
                    className: 'submit-btn',
                    disabled: loading
                }, loading ? 'Adicionando...' : 'Adicionar na Planilha'),
                React.createElement('button', {
                    type: 'button',
                    onClick: onCancel,
                    style: { 
                        padding: '12px', 
                        background: '#95a5a6', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: 'pointer' 
                    }
                }, 'Cancelar')
            )
        )
    );
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
    coresEspecialistas[nome] = `hsl(${h}, 70%, 50%)`;
    return coresEspecialistas[nome];
}

// FUNÇÃO MELHORADA: Usar GeoJSON das cidades brasileiras
async function getCidadeMaisProxima(latLng) {
    if (!cidadesBrasil || !cidadesBrasil.features) {
        return { nome: 'Dados não disponíveis', distancia: 0 };
    }

    let cidadeMaisProxima = null;
    let menorDistancia = Infinity;

    cidadesBrasil.features.forEach(feature => {
        const cidadeLatLng = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
        const distancia = latLng.distanceTo(cidadeLatLng);
        
        if (distancia < menorDistancia) {
            menorDistancia = distancia;
            cidadeMaisProxima = feature.properties.nome;
        }
    });

    return {
        nome: cidadeMaisProxima || 'Não encontrada',
        distancia: menorDistancia
    };
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
    if (isVisible) map.addLayer(layer);
    else map.removeLayer(layer);
}

function ajustarZoom() {
    const bounds = new L.LatLngBounds();
    dadosFiltrados.fazendas.forEach(f => bounds.extend(L.latLng(f.latLng.lat, f.latLng.lng)));
    dadosFiltrados.especialistas.forEach(e => bounds.extend(L.latLng(e.latLngBase.lat, e.latLngBase.lng)));
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
}

function mostrarLoading(mostrar) {
    document.getElementById('loading-overlay').style.display = mostrar ? 'flex' : 'none';
}

function criarLegenda(especialistas) {
    const content = document.getElementById('legend-content');
    content.innerHTML = '';
    especialistas.forEach(especialista => {
        const count = especialista.unidadesAtendidas.length;
        if (count > 0) {
            const cor = getCorEspecialista(especialista.nome);
            content.innerHTML += `<div class="legend-item"><div class="legend-color" style="background-color: ${cor};"></div><span>${especialista.nome}</span><span class="legend-count">(${count})</span></div>`;
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

