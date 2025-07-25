// ===================================================================
//  ARQUIVO: script.js (VERSÃO FINAL - LÓGICA V11 + API HÍBRIDA + JSON)
// ===================================================================

// --- CONFIGURAÇÃO DAS APIS ---
const JSONBIN_CONFIG = {
    // COLE A URL DO SEU BIN AQUI
    url: 'https://api.jsonbin.io/v3/b/6883c29b7b4b8670d8a74960',
    // COLE A SUA CHAVE 'X-Master-Key' AQUI
    apiKey: '$2a$10$ho4glL/UKIF5yCn37/l5M.p/9Pt5xG.A3Izi9G8VOX.RTkkFXMygW'
};
const GOOGLE_SCRIPT_CONFIG = {
    // COLE A URL DA SUA IMPLANTAÇÃO DO GOOGLE APPS SCRIPT AQUI
    url: 'https://script.google.com/macros/s/AKfycbxDGlKNbAUAiCq7JznLqXlEHpgo1r7ioJW_NsPABBY5hrR_0njMU93eSfGJZeMCouqdQg/exec'
};

// --- SERVIÇO DE API HÍBRIDO ---
const APIService = {
    fetchData: async ( ) => {
        try {
            const response = await fetch(JSONBIN_CONFIG.url, { headers: { 'X-Master-Key': JSONBIN_CONFIG.apiKey } });
            if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
            const data = await response.json();
            return data.record;
        } catch (error) {
            console.error("Falha ao buscar dados do JSONBin:", error);
            alert(`Não foi possível carregar os dados do mapa: ${error.message}.`);
            return [];
        }
    },
    postData: async (data) => {
        try {
            await fetch(GOOGLE_SCRIPT_CONFIG.url, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return { status: 'success' };
        } catch (error) {
            console.error('Erro ao enviar dados para o Google Script:', error);
            return { status: 'error' };
        }
    }
};

// --- COMPONENTES REACT (NOVO FORMULÁRIO) ---
function UserManagement() {
    const [loading, setLoading] = React.useState(false);
    const handleAddUser = async (userData) => {
        setLoading(true);
        const payload = { action: 'addEntrada', ...userData };
        const result = await APIService.postData(payload);
        setLoading(false);
        if (result.status === 'success') {
            alert('Entrada adicionada com sucesso na planilha! Para ver a mudança no mapa, atualize os dados no JSONBin.io e recarregue a página.');
        } else {
            alert('Ocorreu um erro ao adicionar a entrada.');
        }
    };
    if (loading) return React.createElement('div', null, 'Adicionando...');
    return React.createElement('div', { style: { padding: '20px' } },
        React.createElement('h1', null, 'Gerenciamento de Dados'),
        React.createElement('h2', null, 'Adicionar Nova Entrada'),
        React.createElement(AddUserForm, { onAddUser: handleAddUser })
    );
}

function AddUserForm({ onAddUser }) {
    const [formData, setFormData] = React.useState({});
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleSubmit = (e) => {
        e.preventDefault();
        onAddUser(formData);
        setFormData({});
    };
    const fields = [
        { name: 'GESTOR', placeholder: 'Nome do gestor' },
        { name: 'ESPECIALISTA', placeholder: 'Nome do especialista' },
        { name: 'CIDADE_BASE', placeholder: 'Cidade de atuação' },
        { name: 'COORDENADAS_BASE', placeholder: 'Ex: -18.78, -52.60' },
        { name: 'UNIDADE', placeholder: 'Nome da fazenda/unidade' },
        { name: 'COORDENADAS_UNIDADE', placeholder: 'Ex: -18.78, -52.60' }
    ];
    return React.createElement('form', { onSubmit: handleSubmit },
        ...fields.map(field => React.createElement('div', { key: field.name, style: { marginBottom: '10px' } },
            React.createElement('label', { style: { display: 'block', marginBottom: '5px' } }, `${field.name.replace(/_/g, ' ')}:`),
            React.createElement('input', {
                type: 'text', name: field.name, required: true,
                onChange: handleChange, value: formData[field.name] || '',
                placeholder: field.placeholder,
                style: { width: '100%', padding: '8px', boxSizing: 'border-box' }
            })
        )),
        React.createElement('button', { type: "submit", style: { padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' } }, 'Adicionar na Planilha')
    );
}

// --- LÓGICA DO MAPA (BASEADA NO SEU CÓDIGO v11) ---

let map;
let dadosOriginais = null;
let dadosFiltrados = null;
let camadasVisiveis = {
    especialistas: L.markerClusterGroup(), 
    fazendas: L.layerGroup(),
    rotas: L.layerGroup(),
    areas: L.layerGroup()
};

const coresEspecialistas = {
    'IGOR.DIAS': '#0ccf26ff', 'GIOVANI.CATAPAN': '#27ae60', 'ALYNE.SOUZA': '#3498db',
    'GENEZIO.NASCIMENTO': '#f39c12', 'NATALIA.NUNES': '#9b59b6', 'CARLOS.MAGALHAES': '#1abc9c',
    'FELIPHE.SANTOS': '#e91e1eff', 'FELIPE.AMORINI': '#1346cfff', 'EVANILSON.SANTANA': '#2c3e50',
    'EDGAR.NETO': '#7f8c8d', 'KETELLY.VIEIRA': '#ce1195ff'
};

const camadasBase = {
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' } ),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' } ),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' } )
};

function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6';
    return coresEspecialistas[String(nome).trim().toUpperCase()] || '#95a5a6';
}

function formatarDistancia(distanciaEmMetros) {
    if (isNaN(distanciaEmMetros)) return 'N/A';
    return (distanciaEmMetros / 1000).toFixed(1) + ' km';
}

function inicializarMapa() {
    const mapElement = document.getElementById('map');
    if (!mapElement || mapElement._leaflet_id) return;
    map = L.map('map', { center: [-15.7, -47.9], zoom: 5, zoomControl: true });
    camadasBase.osm.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
}

async function carregarDados() {
    mostrarLoading(true);
    const dados = await APIService.fetchData();
    if (dados && dados.length > 0) {
        dadosOriginais = { especialistas: [], fazendas: [] };
        const especialistasMap = new Map();

        dados.forEach(item => {
            try {
                // CORREÇÃO APLICADA AQUI: Trocado 'COORDENADAS_BASE' por 'COORDENADAS_CIDADE'
                if (!item.ESPECIALISTA || !item.COORDENADAS_CIDADE || !item.COORDENADAS_UNIDADE) {
                    console.warn("Item de dados ignorado por falta de informações essenciais:", item);
                    return; 
                }

                if (!especialistasMap.has(item.ESPECIALISTA)) {
                    // CORREÇÃO APLICADA AQUI: Lendo da coluna correta
                    const [lat, lon] = item.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
                    if(isNaN(lat) || isNaN(lon)) return; 
                    especialistasMap.set(item.ESPECIALISTA, {
                        nome: item.ESPECIALISTA,
                        gestor: item.GESTOR,
                        cidade_base: item.CIDADE_BASE,
                        latitude_base: lat,
                        longitude_base: lon
                    });
                }
                
                const [lat, lon] = item.COORDENADAS_UNIDADE.split(',').map(c => parseFloat(c.trim()));
                if(isNaN(lat) || isNaN(lon)) return; 
                dadosOriginais.fazendas.push({
                    nome: item.UNIDADE,
                    especialista: item.ESPECIALISTA,
                    cidade_origem: item.CIDADE_BASE,
                    centroide: [lat, lon],
                    geometria: { type: "Point", coordinates: [lon, lat] }
                });
            } catch (e) {
                console.warn("Erro ao processar item de dados:", item, e);
            }
        });
        dadosOriginais.especialistas = Array.from(especialistasMap.values());
        
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
        processarDados();
        preencherFiltros();
    }
    mostrarLoading(false);
}

function processarDados() {
    if (!camadasVisiveis || !dadosFiltrados) return;
    Object.values(camadasVisiveis).forEach(layer => layer.clearLayers());
    const fazendasAgrupadas = agruparFazendas(dadosFiltrados.fazendas);
    desenharFazendasEIcones(fazendasAgrupadas);
    desenharEspecialistas(fazendasAgrupadas);
    desenharRotas(fazendasAgrupadas).then(distanciaTotalDasRotas => {
        desenharAreasAtuacao(fazendasAgrupadas);
        atualizarEstatisticas(fazendasAgrupadas, distanciaTotalDasRotas); 
    });
    criarLegenda();
    ajustarVisualizacao(fazendasAgrupadas);
}

function agruparFazendas(listaDeFazendas) {
    const fazendas = {};
    listaDeFazendas.forEach(p => {
        if (!fazendas[p.nome]) {
            fazendas[p.nome] = {
                nome: p.nome, especialista: p.especialista, cidade_origem: p.cidade_origem,
                poligonos: [], centroides: []
            };
        }
        if (p.geometria) fazendas[p.nome].poligonos.push(p.geometria);
        if (p.centroide) fazendas[p.nome].centroides.push(p.centroide);
    });
    Object.values(fazendas).forEach(fazenda => {
        if (fazenda.centroides.length > 0) {
            let latSum = 0, lngSum = 0;
            fazenda.centroides.forEach(c => { latSum += c[0]; lngSum += c[1]; });
            fazenda.centroideGeral = [latSum / fazenda.centroides.length, lngSum / fazenda.centroides.length];
        }
    });
    return fazendas;
}

function desenharFazendasEIcones(fazendasAgrupadas) {
    if (!camadasVisiveis.fazendas || !map) return;
    Object.values(fazendasAgrupadas).forEach(fazenda => {
        if (!fazenda.centroideGeral) return;
        const cor = getCorEspecialista(fazenda.especialista);
        const especialistaInfo = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
        let distanciaFormatada = 'N/A';
        if (especialistaInfo && especialistaInfo.latitude_base && especialistaInfo.longitude_base) {
            const pontoEspecialista = L.latLng(especialistaInfo.latitude_base, especialistaInfo.longitude_base);
            const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
            distanciaFormatada = formatarDistancia(map.distance(pontoEspecialista, pontoFazenda));
        }
        L.marker(fazenda.centroideGeral, { icon: criarIconeFazenda(cor) })
            .bindPopup(`<h4>Fazenda: ${fazenda.nome}</h4><p><strong>Cidade de Origem:</strong> ${fazenda.cidade_origem || 'N/A'}</p><p><strong>Atendida por:</strong> ${fazenda.especialista}</p><p><strong>Distância da Base:</strong> ${distanciaFormatada}</p>`)
            .addTo(camadasVisiveis.fazendas);
    });
}

function desenharEspecialistas(fazendasAgrupadas) {
    if (!camadasVisiveis.especialistas || !dadosOriginais.especialistas) return;
    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.nome);
        if (fazendasAtendidas.length === 0 || !especialista.latitude_base) return;
        const cor = getCorEspecialista(especialista.nome);
        const { maxDist, avgDist } = calcularDistancias(especialista, fazendasAtendidas);
        const listaFazendasHtml = fazendasAtendidas.map(f => `<li>${f.nome}</li>`).join('');
        L.marker([especialista.latitude_base, especialista.longitude_base], { icon: criarIconeEspecialista(cor) })
            .bindPopup(`<h4>Especialista: ${especialista.nome}</h4><p><strong>Cidade Base:</strong> ${especialista.cidade_base || 'N/A'}</p><p><strong>Raio Máximo:</strong> ${formatarDistancia(maxDist)}</p><p><strong>Distância Média:</strong> ${formatarDistancia(avgDist)}</p><p><strong>Unidades Atendidas (${fazendasAtendidas.length}):</strong></p><ul style="margin-top: 5px; padding-left: 20px;">${listaFazendasHtml}</ul>`)
            .addTo(camadasVisiveis.especialistas);
    });
}

async function desenharRotas(fazendasAgrupadas) {
    if (!camadasVisiveis.rotas || !map) return 0;
    const especialistas = dadosOriginais.especialistas.reduce((acc, e) => {
        if (e.latitude_base && e.longitude_base) acc[e.nome] = { lat: e.latitude_base, lon: e.longitude_base };
        return acc;
    }, {});
    let distanciaTotalAcumulada = 0;
    for (const fazenda of Object.values(fazendasAgrupadas)) {
        const especialistaInfo = especialistas[fazenda.especialista];
        if (especialistaInfo && fazenda.centroideGeral) {
            const cor = getCorEspecialista(fazenda.especialista);
            const start = `${especialistaInfo.lon},${especialistaInfo.lat}`;
            const end = `${fazenda.centroideGeral[1]},${fazenda.centroideGeral[0]}`;
            try {
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson` );
                if (!response.ok) throw new Error('Falha na API de roteamento');
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    L.geoJSON(data.routes[0].geometry, { style: { color: cor, weight: 4, opacity: 0.6 } }).addTo(camadasVisiveis.rotas);
                    distanciaTotalAcumulada += data.routes[0].distance;
                }
            } catch (error) {
                const p1 = L.latLng(especialistaInfo.lat, especialistaInfo.lon);
                const p2 = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
                L.polyline([p1, p2], { color: cor, weight: 2, opacity: 0.6, dashArray: '5, 5' }).addTo(camadasVisiveis.rotas);
                distanciaTotalAcumulada += map.distance(p1, p2);
            }
        }
    }
    return distanciaTotalAcumulada;
}

function desenharAreasAtuacao(fazendasAgrupadas) {
    if (!camadasVisiveis.areas || !dadosOriginais.especialistas) return;
    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.nome);
        if (fazendasAtendidas.length > 0 && especialista.latitude_base) {
            const { maxDist } = calcularDistancias(especialista, fazendasAtendidas);
            const cor = getCorEspecialista(especialista.nome);
            L.circle([especialista.latitude_base, especialista.longitude_base], {
                color: cor, fillColor: cor, fillOpacity: 0.1, radius: maxDist, weight: 1.5, dashArray: '10, 10'
            }).addTo(camadasVisiveis.areas);
        }
    });
}

function criarIconeEspecialista(cor) {
    return L.divIcon({ className: 'custom-marker', html: `<div style="background-color: ${cor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"><i class="fas fa-user"></i></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

function criarIconeFazenda(cor) {
    return L.divIcon({ className: 'custom-marker', html: `<div style="font-size: 24px; color: ${cor}; text-shadow: 0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white;"><i class="fas fa-tractor"></i></div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
}

function calcularDistancias(especialista, fazendas) {
    if (!map || !especialista.latitude_base) return { maxDist: 0, avgDist: 0 };
    const distancias = fazendas.map(f => {
        if (!f.centroideGeral) return 0;
        const p1 = L.latLng(especialista.latitude_base, especialista.longitude_base);
        const p2 = L.latLng(f.centroideGeral[0], f.centroideGeral[1]);
        return map.distance(p1, p2);
    }).filter(d => d > 0);
    if (distancias.length === 0) return { maxDist: 0, avgDist: 0 };
    const maxDist = Math.max(...distancias);
    const avgDist = distancias.reduce((a, b) => a + b, 0) / distancias.length;
    return { maxDist, avgDist };
}

function atualizarEstatisticas(fazendasAgrupadas, distanciaTotal) {
    if (!fazendasAgrupadas) return;
    const totalUnidades = Object.keys(fazendasAgrupadas).length;
    const totalEspecialistas = new Set(Object.values(fazendasAgrupadas).map(f => f.especialista)).size;
    const distanciaMedia = totalUnidades > 0 ? distanciaTotal / totalUnidades : 0;
    document.getElementById('total-unidades').textContent = totalUnidades;
    document.getElementById('total-especialistas').textContent = totalEspecialistas;
    document.getElementById('distancia-media').textContent = formatarDistancia(distanciaMedia);
}

function criarLegenda() {
    const legendaContent = document.getElementById('legend-content');
    if (!legendaContent || !dadosFiltrados) return;
    legendaContent.innerHTML = '';
    const contadores = {};
    const especialistasNosDados = new Set(dadosFiltrados.fazendas.map(f => f.especialista));
    especialistasNosDados.forEach(especialista => {
        if(especialista) contadores[especialista] = new Set(dadosFiltrados.fazendas.filter(f => f.especialista === especialista).map(f => f.nome)).size;
    });
    Object.entries(contadores).sort().forEach(([especialista, count]) => {
        const cor = getCorEspecialista(especialista);
        legendaContent.innerHTML += `<div class="legend-item"><div class="legend-color" style="background-color: ${cor};"></div><span>${especialista}</span><span class="legend-count">(${count})</span></div>`;
    });
}

function aplicarFiltros() {
    if (!dadosOriginais) return;
    const gestorSel = document.getElementById('gestor-filter')?.value || '';
    const especialistaSel = document.getElementById('especialista-filter')?.value || '';
    
    const especialistasFiltradosNomes = new Set(
        dadosOriginais.especialistas
            .filter(e => (gestorSel ? e.gestor === gestorSel : true) && (especialistaSel ? e.nome === especialistaSel : true))
            .map(e => e.nome)
    );
    
    dadosFiltrados.fazendas = dadosOriginais.fazendas.filter(f => especialistasFiltradosNomes.has(f.especialista));
    processarDados();
}

function configurarEventListeners() {
    const addListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) element.addEventListener(event, handler);
    };
    addListener('gestor-filter', 'change', aplicarFiltros);
    addListener('especialista-filter', 'change', aplicarFiltros);
    addListener('resetar-filtros', 'click', () => {
        document.getElementById('gestor-filter').value = '';
        document.getElementById('especialista-filter').value = '';
        if (dadosOriginais) {
            dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
            processarDados();
        }
    });
    document.querySelectorAll('input[name="base-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            Object.values(camadasBase).forEach(camada => map.removeLayer(camada));
            camadasBase[this.value].addTo(map);
        });
    });
    addListener('show-colaboradores', 'change', e => toggleLayer(camadasVisiveis.especialistas, e.target.checked));
    addListener('show-fazendas', 'change', e => toggleLayer(camadasVisiveis.fazendas, e.target.checked));
    addListener('show-rotas', 'change', e => toggleLayer(camadasVisiveis.rotas, e.target.checked));
    addListener('show-areas', 'change', e => toggleLayer(camadasVisiveis.areas, e.target.checked));
    addListener('open-user-management', 'click', () => document.getElementById('user-management-container').style.display = 'block');
    addListener('close-user-management', 'click', () => document.getElementById('user-management-container').style.display = 'none');
}

function preencherFiltros() {
    if (!dadosOriginais) return;
    const gestorSelect = document.getElementById('gestor-filter');
    const especialistaSelect = document.getElementById('especialista-filter');
    if (!gestorSelect || !especialistaSelect) return;
    gestorSelect.innerHTML = '<option value="">Todos</option>';
    especialistaSelect.innerHTML = '<option value="">Todos</option>';
    
    const gestores = [...new Set(dadosOriginais.especialistas.map(e => e.gestor))].filter(Boolean).sort();
    gestores.forEach(g => gestorSelect.add(new Option(g, g)));
    
    const especialistas = [...new Set(dadosOriginais.especialistas.map(e => e.nome))].filter(Boolean).sort();
    especialistas.forEach(e => especialistaSelect.add(new Option(e, e)));
}

function toggleLayer(layer, isVisible) {
    if (!map || !layer) return;
    if (isVisible) map.addLayer(layer); 
    else map.removeLayer(layer);
}

function ajustarVisualizacao(fazendasAgrupadas) {
    if (!map || !fazendasAgrupadas) return;
    const bounds = new L.LatLngBounds();
    Object.values(fazendasAgrupadas).forEach(f => {
        if (f.centroideGeral) bounds.extend(f.centroideGeral);
    });
    if (dadosOriginais?.especialistas) {
        dadosOriginais.especialistas.forEach(e => {
            if (e.latitude_base && e.longitude_base) {
                bounds.extend([e.latitude_base, e.longitude_base]);
            }
        });
    }
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function mostrarLoading(mostrar) {
    const loadingElement = document.getElementById('loading-overlay');
    if (loadingElement) {
        loadingElement.style.display = mostrar ? 'flex' : 'none';
    }
}

function inicializarAplicacao() {
    const elementosEssenciais = ['map', 'user-management-root'];
    const elementosFaltantes = elementosEssenciais.filter(id => !document.getElementById(id));
    if (elementosFaltantes.length > 0) {
        console.error('Erro Crítico: Elementos do DOM não encontrados:', elementosFaltantes);
        document.body.innerHTML = `<div style="padding: 20px; background-color: #ffcccc; border: 1px solid red;">Erro: Elementos essenciais (${elementosFaltantes.join(', ')}) não foram encontrados no HTML. A aplicação não pode iniciar.</div>`;
        return;
    }

    try {
        console.log('Inicializando aplicação...');
        inicializarMapa();
        carregarDados();
        configurarEventListeners();
        
        const userManagementRoot = document.getElementById('user-management-root');
        ReactDOM.render(React.createElement(UserManagement), userManagementRoot);
        
        console.log('Aplicação inicializada com sucesso');
    } catch (error) {
        console.error('Erro fatal durante a inicialização:', error);
        alert('Erro crítico ao iniciar a aplicação. Verifique o console para detalhes.');
    }
}

document.addEventListener('DOMContentLoaded', inicializarAplicacao);
