const APIService = {
    // COLE A URL DO SEU BIN AQUI (a que começa com https://api.jsonbin.io/v3/b/... )
    url: 'https://api.jsonbin.io/v3/b/68839ecb7b4b8670d8a73a5a',

    // COLE A SUA CHAVE 'X-Master-Key' QUE VOCÊ ACABOU DE COPIAR AQUI
    apiKey: '$2a$10$2d6Fwwo3IMTzavWLYo77T.59Lo4//Kn2l.xVwtswt83I248oNkESW',

    fetchData: async () => {
        try {
            const response = await fetch(this.url, {
                headers: {
                    // Usa a sua chave de API pessoal para ter permissão de leitura
                    'X-Master-Key': this.apiKey
                }
            });
            if (!response.ok) {
                // O erro 404 vai cair aqui, nos dando uma mensagem clara.
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            // A resposta do JSONBin vem dentro de um objeto 'record'
            return data.record;
        } catch (error) {
            console.error("Falha crítica ao buscar dados do JSONBin:", error);
            alert(`Não foi possível carregar os dados do mapa: ${error.message}. Verifique a URL do Bin e a Chave de API no script.js.`);
            return [];
        }
    },
    postData: async (data) => {
        alert('A função de adicionar usuário está desabilitada. Para adicionar, edite a planilha e cole os novos dados no JSONBin.io.');
        return { status: 'info' };
    }
};


// --- COMPONENTES REACT ---
function UserManagement() {
    const [loading, setLoading] = React.useState(false);
    const handleAddUser = async (userData) => {
        setLoading(true);
        const payload = { action: 'addColaborador', ...userData };
        const result = await APIService.postData(payload);
        setLoading(false);
        if (result.status === 'success') {
            alert('Dados enviados com sucesso! A página será recarregada para refletir as mudanças.');
            window.location.reload();
        } else {
            alert('Ocorreu um erro ao adicionar o usuário.');
        }
    };
    if (loading) return React.createElement('div', null, 'Adicionando...');
    return React.createElement('div', { style: { padding: '20px' } },
        React.createElement('h1', null, 'Gerenciamento de Usuários'),
        React.createElement('h2', null, 'Adicionar Novo Colaborador/Especialista'),
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
        { name: 'GESTOR', placeholder: 'Nome do gestor responsável' },
        { name: 'ESPECIALISTA', placeholder: 'Nome do especialista (ex: NOME.SOBRENOME)' },
        { name: 'CIDADE_BASE', placeholder: 'Cidade de atuação' },
        { name: 'UNIDADE', placeholder: 'Unidade de atendimento' },
        { name: 'COORDENADAS_CIDADE', placeholder: 'Ex: -12.34567, -56.78901' }
    ];
    return React.createElement('form', { onSubmit: handleSubmit },
        ...fields.map(field => React.createElement('div', { key: field.name, style: { marginBottom: '10px' } },
            React.createElement('label', { style: { display: 'block', marginBottom: '5px', textTransform: 'capitalize' } }, `${field.name.replace('_', ' ')}:`),
            React.createElement('input', {
                type: 'text', name: field.name, required: true,
                onChange: handleChange, value: formData[field.name] || '',
                placeholder: field.placeholder,
                style: { width: '100%', padding: '8px', boxSizing: 'border-box' }
            })
        )),
        React.createElement('button', { type: "submit", style: { padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' } }, 'Adicionar Colaborador')
    );
}


// --- LÓGICA DO MAPA (COMPLETA) ---

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
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }  ),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' }  ),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' }  )
};

function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6';
    const nomeNormalizado = String(nome).trim().toUpperCase();
    return coresEspecialistas[nomeNormalizado] || '#95a5a6';
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
        dadosOriginais = {
            especialistas: dados,
            fazendas: dados.map(d => ({
                nome: d.UNIDADE,
                especialista: d.ESPECIALISTA,
                cidade_origem: d.CIDADE_BASE,
                geometria: null,
                centroide: d.COORDENADAS_CIDADE ? d.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim())) : null
            })).filter(f => f.centroide && !isNaN(f.centroide[0]) && !isNaN(f.centroide[1]))
        };
        
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
        processarDados();
        preencherFiltros();
    } else {
        console.log("Nenhum dado foi retornado pela API ou a API falhou.");
    }
    mostrarLoading(false);
}

function processarDados() {
    if (!camadasVisiveis || !dadosFiltrados) return;
    Object.values(camadasVisiveis).forEach(layer => {
        if (layer && layer.clearLayers) layer.clearLayers();
    });
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
    if (!Array.isArray(listaDeFazendas)) return fazendas;
    listaDeFazendas.forEach(p => {
        if (!p || !p.nome) return;
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
        const especialistaInfo = dadosOriginais.especialistas.find(e => e.ESPECIALISTA === fazenda.especialista);
        
        let distanciaFormatada = 'N/A';
        if (especialistaInfo && especialistaInfo.COORDENADAS_CIDADE) {
            const [latBase, lonBase] = especialistaInfo.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
            if(!isNaN(latBase) && !isNaN(lonBase)) {
                const pontoEspecialista = L.latLng(latBase, lonBase);
                const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
                distanciaFormatada = formatarDistancia(map.distance(pontoEspecialista, pontoFazenda));
            }
        }

        L.marker(fazenda.centroideGeral, { icon: criarIconeFazenda(cor) })
            .bindPopup(`<h4>Fazenda: ${fazenda.nome}</h4><p><strong>Cidade de Origem:</strong> ${fazenda.cidade_origem || 'N/A'}</p><p><strong>Atendida por:</strong> ${fazenda.especialista}</p><p><strong>Distância da Base:</strong> ${distanciaFormatada}</p>`)
            .addTo(camadasVisiveis.fazendas);
    });
}

function desenharEspecialistas(fazendasAgrupadas) {
    if (!camadasVisiveis.especialistas || !dadosOriginais.especialistas) return;
    
    dadosOriginais.especialistas.forEach(especialista => {
        if (!especialista.COORDENADAS_CIDADE) return;
        const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
        if (isNaN(latBase) || isNaN(lonBase)) return;

        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.ESPECIALISTA);
        if (fazendasAtendidas.length === 0) return;

        const cor = getCorEspecialista(especialista.ESPECIALISTA);
        const { maxDist, avgDist } = calcularDistancias(especialista, fazendasAtendidas);
        const listaFazendasHtml = fazendasAtendidas.map(f => `<li>${f.nome}</li>`).join('');

        L.marker([latBase, lonBase], { icon: criarIconeEspecialista(cor) })
            .bindPopup(`<h4>Especialista: ${especialista.ESPECIALISTA}</h4><p><strong>Cidade Base:</strong> ${especialista.CIDADE_BASE || 'N/A'}</p><p><strong>Raio Máximo:</strong> ${formatarDistancia(maxDist)}</p><p><strong>Distância Média:</strong> ${formatarDistancia(avgDist)}</p><p><strong>Unidades Atendidas (${fazendasAtendidas.length}):</strong></p><ul style="margin-top: 5px; padding-left: 20px;">${listaFazendasHtml}</ul>`)
            .addTo(camadasVisiveis.especialistas);
    });
}

async function desenharRotas(fazendasAgrupadas) { return 0; }

function desenharAreasAtuacao(fazendasAgrupadas) {
    if (!camadasVisiveis.areas || !dadosOriginais.especialistas) return;
    dadosOriginais.especialistas.forEach(especialista => {
        if (!especialista.COORDENADAS_CIDADE) return;
        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.ESPECIALISTA);
        if (fazendasAtendidas.length > 0) {
            const { maxDist } = calcularDistancias(especialista, fazendasAtendidas);
            const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
            if(isNaN(latBase) || isNaN(lonBase)) return;
            const cor = getCorEspecialista(especialista.ESPECIALISTA);
            L.circle([latBase, lonBase], {
                color: cor, fillColor: cor, fillOpacity: 0.1, radius: maxDist, weight: 1.5, dashArray: '10, 10'
            }).addTo(camadasVisiveis.areas);
        }
    });
}

function criarIconeEspecialista(cor) {
    return L.divIcon({ 
        className: 'custom-marker', 
        html: `<div style="background-color: ${cor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"><i class="fas fa-user"></i></div>`, 
        iconSize: [30, 30], iconAnchor: [15, 15] 
    });
}

function criarIconeFazenda(cor) {
    return L.divIcon({ 
        className: 'custom-marker', 
        html: `<div style="font-size: 24px; color: ${cor}; text-shadow: 0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white;"><i class="fas fa-tractor"></i></div>`, 
        iconSize: [24, 24], iconAnchor: [12, 12] 
    });
}

function calcularDistancias(especialista, fazendas) {
    if (!map || !especialista.COORDENADAS_CIDADE) return { maxDist: 0, avgDist: 0 };
    const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
    if(isNaN(latBase) || isNaN(lonBase)) return { maxDist: 0, avgDist: 0 };
    const distancias = fazendas.map(f => {
        if (!f.centroideGeral) return 0;
        return map.distance(L.latLng(latBase, lonBase), L.latLng(f.centroideGeral[0], f.centroideGeral[1]));
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
    if (!legendaContent || !dadosFiltrados || !dadosFiltrados.fazendas) return;
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
    
    dadosFiltrados.especialistas = dadosOriginais.especialistas.filter(e => {
        const porGestor = gestorSel ? e.GESTOR === gestorSel : true;
        const porEspecialista = especialistaSel ? e.ESPECIALISTA === especialistaSel : true;
        return porGestor && porEspecialista;
    });

    const especialistasVisiveis = new Set(dadosFiltrados.especialistas.map(e => e.ESPECIALISTA));
    dadosFiltrados.fazendas = dadosOriginais.fazendas.filter(f => especialistasVisiveis.has(f.especialista));

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
    if (!dadosOriginais || !dadosOriginais.especialistas) return;
    const gestorSelect = document.getElementById('gestor-filter');
    const especialistaSelect = document.getElementById('especialista-filter');
    if (!gestorSelect || !especialistaSelect) return;
    gestorSelect.innerHTML = '<option value="">Todos</option>';
    especialistaSelect.innerHTML = '<option value="">Todos</option>';
    
    const gestores = [...new Set(dadosOriginais.especialistas.map(e => e.GESTOR))].filter(Boolean).sort();
    gestores.forEach(g => gestorSelect.add(new Option(g, g)));
    
    const especialistas = [...new Set(dadosOriginais.especialistas.map(e => e.ESPECIALISTA))].filter(Boolean).sort();
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
            if (e.COORDENADAS_CIDADE) {
                const [lat, lon] = e.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
                if (!isNaN(lat) && !isNaN(lon) && dadosFiltrados.especialistas.some(df => df.ESPECIALISTA === e.ESPECIALISTA)) {
                    bounds.extend([lat, lon]);
                }
            }
        });
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
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
