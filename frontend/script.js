// Variáveis globais
let map;
let dadosOriginais = null;
let dadosFiltrados = null;
let camadasVisiveis = {
    especialistas: L.markerClusterGroup(), 
    fazendas: L.layerGroup(),
    rotas: L.layerGroup(),
    areas: L.layerGroup()
};

// *** MUDANÇA PRINCIPAL: USO DO PROXY CORS ***
const APIService = {
    // A URL original do seu script do Google.
    googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxJgCiehsomuB5A1R8i29fKC8gco42zWNkt1iNvK0H9C_XqpU0_KeyuAF8pio3L8H9BhA/exec',
    
    // O proxy que vamos usar.
    proxyUrl: 'https://api.allorigins.win/get?url=',

    fetchData: async function( ) {
        try {
            // Construímos a nova URL: Proxy + URL do Google codificada
            const urlParaFetch = `${this.proxyUrl}${encodeURIComponent(this.googleScriptUrl)}`;
            
            const response = await fetch(urlParaFetch);
            if (!response.ok) throw new Error(`Erro na resposta do proxy: ${response.statusText}`);
            
            const data = await response.json();
            
            // O proxy allOrigins envolve a resposta em um objeto 'contents'.
            // Precisamos extrair e converter o JSON que está lá dentro.
            return JSON.parse(data.contents);

        } catch (error) {
            console.error('Erro ao buscar dados via proxy:', error);
            alert("Falha ao carregar dados do mapa. Verifique o console.");
            return [];
        }
    },
    postData: async function(data) {
        try {
            await fetch(this.googleScriptUrl, {
                method: 'POST',
                mode: 'no-cors', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(data)
            });
            return { status: 'success' };
        } catch (error) {
            console.error('Erro ao enviar dados:', error);
            return { status: 'error', message: 'Falha ao enviar dados.' };
        }
    }
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
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }  ),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' }  ),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' }  )
};

// --- FUNÇÕES AUXILIARES ---
function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6';
    const nomeNormalizado = String(nome).trim().toUpperCase();
    return coresEspecialistas[nomeNormalizado] || '#95a5a6';
}

function formatarDistancia(distanciaEmMetros) {
    if (isNaN(distanciaEmMetros)) return 'N/A';
    return (distanciaEmMetros / 1000).toFixed(1) + ' km';
}

// --- COMPONENTES REACT ---

// *** 2. COMPONENTE DE GERENCIAMENTO SIMPLIFICADO ***
// Agora ele tem apenas um formulário e uma função para adicionar usuários.
function UserManagement() {
    const [loading, setLoading] = React.useState(false);

    const handleAddUser = async (userData) => {
        setLoading(true);
        const payload = {
            action: 'addColaborador', // Ação que o backend vai reconhecer
            ...userData
        };
        
        const result = await APIService.postData(payload);
        setLoading(false);
        
        if (result.status === 'success') {
            alert('Dados enviados com sucesso! A planilha será atualizada. A página será recarregada para exibir os novos dados.');
            window.location.reload(); // Recarrega a página para buscar os dados atualizados
        } else {
            alert('Ocorreu um erro ao adicionar o usuário. Verifique o console.');
        }
    };

    if (loading) return React.createElement('div', null, 'Adicionando usuário...');

    return React.createElement('div', {style: {padding: '20px'}},
        React.createElement('h1', null, 'Gerenciamento de Usuários'),
        React.createElement('div', {style: {marginBottom: '40px'}},
            React.createElement('h2', null, 'Adicionar Novo Colaborador/Especialista'),
            React.createElement(AddUserForm, { onAddUser: handleAddUser })
        )
        // A tabela de usuários foi removida para simplificar, já que os dados estão no mapa.
    );
}

// *** 3. FORMULÁRIO CORRIGIDO COM OS CAMPOS CERTOS ***
function AddUserForm({ onAddUser }) {
    const [formData, setFormData] = React.useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onAddUser(formData);
        setFormData({}); // Limpa o formulário
    };

    // Campos que você solicitou, correspondendo às colunas da planilha
    const fields = [
        { name: 'GESTOR', type: 'text', required: true, placeholder: 'Nome do gestor responsável' },
        { name: 'ESPECIALISTA', type: 'text', required: true, placeholder: 'Nome do especialista (ex: NOME.SOBRENOME)' },
        { name: 'CIDADE_BASE', type: 'text', required: true, placeholder: 'Cidade de atuação' },
        { name: 'UNIDADE', type: 'text', required: true, placeholder: 'Unidade de atendimento' },
        { name: 'COORDENADAS_CIDADE', type: 'text', required: true, placeholder: 'Ex: -12.34567, -56.78901' }
    ];

    return React.createElement('div', {style: {border: '1px solid #ccc', padding: '20px', marginBottom: '20px', borderRadius: '5px'}},
        React.createElement('form', {onSubmit: handleSubmit},
            fields.map(field => 
                React.createElement('div', {key: field.name, style: {marginBottom: '10px'}},
                    // Transforma 'CIDADE_BASE' em 'CIDADE BASE' para o label
                    React.createElement('label', {style: {display: 'block', marginBottom: '5px', textTransform: 'capitalize'}}, `${field.name.replace('_', ' ')}:`),
                    React.createElement('input', {
                        type: field.type,
                        name: field.name,
                        required: field.required,
                        onChange: handleChange,
                        style: {width: '100%', padding: '8px', boxSizing: 'border-box'},
                        value: formData[field.name] || '',
                        placeholder: field.placeholder
                    })
                )
            ),
            React.createElement('button', {
                type: "submit",
                style: {padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}
            }, 'Adicionar Colaborador')
        )
    );
}


// --- INICIALIZAÇÃO DO MAPA ---
function inicializarMapa() {
    const mapElement = document.getElementById('map');
    if (!mapElement || mapElement._leaflet_id) return;
    map = L.map('map', { center: [-15.7, -47.9], zoom: 5, zoomControl: true });
    camadasBase.osm.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
}

// --- CARREGAMENTO DE DADOS ---
async function carregarDados() {
    mostrarLoading(true);
    // Usa o novo serviço de API para buscar os dados
    const dados = await APIService.fetchData();
    
    // O backend agora retorna um array de objetos, não um objeto com 'especialistas' e 'fazendas'
    // A lógica de processamento precisa ser adaptada para este novo formato.
    // Vamos assumir que os dados retornados são equivalentes ao que antes era 'dadosOriginais.especialistas'
    if (dados && dados.length > 0) {
        // Adaptação: O backend agora envia uma lista única.
        // O frontend precisa derivar as fazendas e especialistas dessa lista.
        dadosOriginais = {
            especialistas: dados,
            fazendas: dados.map(d => ({
                nome: d.UNIDADE,
                especialista: d.ESPECIALISTA,
                cidade_origem: d.CIDADE_BASE,
                geometria: null, // Geometria não vem da planilha, precisa de outra fonte
                centroide: d.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()))
            }))
        };
        
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
        processarDados();
        preencherFiltros();
    }
    mostrarLoading(false);
}

// --- PROCESSAMENTO DE DADOS ---
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
        if (especialistaInfo) {
            const [latBase, lonBase] = especialistaInfo.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
            const pontoEspecialista = L.latLng(latBase, lonBase);
            const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
            distanciaFormatada = formatarDistancia(map.distance(pontoEspecialista, pontoFazenda));
        }

        // L.geoJSON(fazenda.poligonos, { style: { fillColor: cor, weight: 1, opacity: 1, color: 'white', dashArray: '3', fillOpacity: 0.4 } }).addTo(camadasVisiveis.fazendas);
        L.marker(fazenda.centroideGeral, { icon: criarIconeFazenda(cor) })
            .bindPopup(`<h4>Fazenda: ${fazenda.nome}</h4><p><strong>Cidade de Origem:</strong> ${fazenda.cidade_origem || 'N/A'}</p><p><strong>Atendida por:</strong> ${fazenda.especialista}</p><p><strong>Distância da Base:</strong> ${distanciaFormatada}</p>`)
            .addTo(camadasVisiveis.fazendas);
    });
}

function desenharEspecialistas(fazendasAgrupadas) {
    if (!camadasVisiveis.especialistas || !dadosOriginais.especialistas) return;
    
    dadosOriginais.especialistas.forEach(especialista => {
        const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
        if (!latBase || !lonBase) return;

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

async function desenharRotas(fazendasAgrupadas) {
    // Esta função pode precisar de ajustes dependendo da performance
    return 0; // Desabilitado temporariamente para simplificar
}

function desenharAreasAtuacao(fazendasAgrupadas) {
    if (!camadasVisiveis.areas || !dadosOriginais.especialistas) return;
    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.ESPECIALISTA);
        if (fazendasAtendidas.length > 0) {
            const { maxDist } = calcularDistancias(especialista, fazendasAtendidas);
            const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
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
    if (!map) return { maxDist: 0, avgDist: 0 };
    const [latBase, lonBase] = especialista.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
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
            const [lat, lon] = e.COORDENADAS_CIDADE.split(',').map(c => parseFloat(c.trim()));
            if (lat && lon && dadosFiltrados.especialistas.some(df => df.ESPECIALISTA === e.ESPECIALISTA)) {
                bounds.extend([lat, lon]);
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

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
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

// Iniciar a aplicação quando o DOM estiver pronto
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    inicializarAplicacao();
} else {
    document.addEventListener('DOMContentLoaded', inicializarAplicacao);
}
