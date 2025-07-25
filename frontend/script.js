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

// Serviço para gerenciamento de usuários
const UserService = {
    getGestores: async () => {
        try {
            const response = await fetch('https://script.google.com/macros/s/AKfycbwtL5GzIEwwUnkeBRdFn1eDQ_NspxrQmn4DgsJ1-E8f6WnNluGqXkkevl_eGd6RUMaoEg/exec');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar gestores:', error);
            return [];
        }
    },

    getColaboradores: async () => {
        try {
            const response = await fetch('https://script.google.com/macros/s/AKfycbwtL5GzIEwwUnkeBRdFn1eDQ_NspxrQmn4DgsJ1-E8f6WnNluGqXkkevl_eGd6RUMaoEg/exec');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar colaboradores:', error);
            return [];
        }
    },

    addGestor: async (gestorData) => {
        try {
            const response = await fetch('https://script.google.com/macros/s/AKfycbwtL5GzIEwwUnkeBRdFn1eDQ_NspxrQmn4DgsJ1-E8f6WnNluGqXkkevl_eGd6RUMaoEg/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gestorData)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao adicionar gestor:', error);
            return {status: 'error', message: 'Falha ao adicionar gestor'};
        }
    },

    addColaborador: async (colabData) => {
        try {
            const response = await fetch('https://script.google.com/macros/s/AKfycbwtL5GzIEwwUnkeBRdFn1eDQ_NspxrQmn4DgsJ1-E8f6WnNluGqXkkevl_eGd6RUMaoEg/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(colabData)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao adicionar colaborador:', error);
            return {status: 'error', message: 'Falha ao adicionar colaborador'};
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
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }),
    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap' }),
    'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' })
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
function UserManagement() {
    const [gestores, setGestores] = React.useState([]);
    const [colaboradores, setColaboradores] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    const loadUsers = async () => {
        try {
            const [gestoresData, colaboradoresData] = await Promise.all([
                UserService.getGestores(),
                UserService.getColaboradores()
            ]);
            
            setGestores(gestoresData);
            setColaboradores(colaboradoresData);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => { loadUsers(); }, []);

    const handleAddGestor = async (gestorData) => {
        await UserService.addGestor(gestorData);
        loadUsers();
    };

    const handleAddColaborador = async (colabData) => {
        await UserService.addColaborador(colabData);
        loadUsers();
    };

    if (loading) return React.createElement('div', null, 'Carregando...');

    return React.createElement('div', {style: {padding: '20px'}},
        React.createElement('h1', null, 'Gerenciamento de Usuários'),
        
        React.createElement('div', {style: {marginBottom: '40px'}},
            React.createElement('h2', null, 'Adicionar Novo Gestor'),
            React.createElement(AddUserForm, { 
                onAddUser: handleAddGestor,
                userType: "gestor" 
            })
        ),
        
        React.createElement('div', {style: {marginBottom: '40px'}},
            React.createElement('h2', null, 'Adicionar Novo Colaborador'),
            React.createElement(AddUserForm, { 
                onAddUser: handleAddColaborador,
                userType: "colaborador" 
            })
        ),
        
        React.createElement('div', null,
            React.createElement('h2', null, 'Gestores Cadastrados'),
            React.createElement(UserTable, { data: gestores }),
            
            React.createElement('h2', {style: {marginTop: '30px'}}, 'Colaboradores Cadastrados'),
            React.createElement(UserTable, { data: colaboradores })
        )
    );
}

function AddUserForm({ onAddUser, userType }) {
    const [formData, setFormData] = React.useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onAddUser(formData);
        setFormData({});
    };

    const fields = userType === 'gestor' ? [
        { name: 'Nome', type: 'text', required: true },
        { name: 'Email', type: 'email', required: true },
        { name: 'Equipe', type: 'text', required: false }
    ] : [
        { name: 'ID', type: 'text', required: true },
        { name: 'Nome', type: 'text', required: true },
        { name: 'Função', type: 'text', required: false },
        { name: 'Gestor Responsável', type: 'text', required: false }
    ];

    return React.createElement('div', {style: {border: '1px solid #ccc', padding: '20px', marginBottom: '20px', borderRadius: '5px'}},
        React.createElement('form', {onSubmit: handleSubmit},
            fields.map(field => 
                React.createElement('div', {key: field.name, style: {marginBottom: '10px'}},
                    React.createElement('label', {style: {display: 'block', marginBottom: '5px'}}, `${field.name}:`),
                    React.createElement('input', {
                        type: field.type,
                        name: field.name,
                        required: field.required,
                        onChange: handleChange,
                        style: {width: '100%', padding: '8px'},
                        value: formData[field.name] || ''
                    })
                )
            ),
            React.createElement('button', {
                type: "submit",
                style: {padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}
            }, `Adicionar ${userType === 'gestor' ? 'Gestor' : 'Colaborador'}`)
        )
    );
}

function UserTable({ data }) {
    if (!data || data.length === 0) {
        return React.createElement('p', null, 'Nenhum registro encontrado.');
    }

    const headers = Object.keys(data[0]);

    return React.createElement('div', {style: {overflowX: 'auto'}},
        React.createElement('table', {style: {width: '100%', borderCollapse: 'collapse', marginTop: '10px'}},
            React.createElement('thead', null,
                React.createElement('tr', null,
                    headers.map(header => 
                        React.createElement('th', {key: header, style: {padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'left'}}, header)
                    )
                )
            ),
            React.createElement('tbody', null,
                data.map((row, index) =>
                    React.createElement('tr', {key: index},
                        headers.map(header =>
                            React.createElement('td', {key: header, style: {padding: '10px', borderBottom: '1px solid #eee'}}, row[header])
                        )
                    )
                )
            )
        )
    );
}

// --- INICIALIZAÇÃO DO MAPA ---
function inicializarMapa() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Elemento do mapa não encontrado');
        return;
    }

    // Verifica se o elemento do mapa já foi inicializado
    if (mapElement._leaflet_id) {
        console.warn('Mapa já foi inicializado');
        return;
    }

    map = L.map('map', { 
        center: [-15.7, -47.9], 
        zoom: 5, 
        zoomControl: true 
    });

    camadasBase.osm.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    Object.values(camadasVisiveis).forEach(layer => layer.addTo(map));
}

// --- CARREGAMENTO DE DADOS ---
async function carregarDados() {
    mostrarLoading(true);
    try {
        const response = await fetch('https://mapa-interativo-slc.onrender.com/api/dados_mapa');
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        dadosOriginais = await response.json();
        dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
        processarDados();
        preencherFiltros();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do mapa. Verifique o console (F12).');
    } finally {
        mostrarLoading(false);
    }
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

function desenharFazendasEIcones(fazendasAgrupadas) {
    if (!camadasVisiveis.fazendas || !map) return;

    Object.values(fazendasAgrupadas).forEach(fazenda => {
        const cor = getCorEspecialista(fazenda.especialista);
        const especialistaInfo = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
        
        let distanciaFormatada = 'N/A';
        if (especialistaInfo && especialistaInfo.latitude_base && especialistaInfo.longitude_base) {
            const pontoEspecialista = L.latLng(especialistaInfo.latitude_base, especialistaInfo.longitude_base);
            const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
            const distanciaMetros = map.distance(pontoEspecialista, pontoFazenda);
            distanciaFormatada = formatarDistancia(distanciaMetros);
        }

        L.geoJSON(fazenda.poligonos, { 
            style: { fillColor: cor, weight: 1, opacity: 1, color: 'white', dashArray: '3', fillOpacity: 0.4 } 
        }).addTo(camadasVisiveis.fazendas);

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

function desenharEspecialistas(fazendasAgrupadas) {
    if (!camadasVisiveis.especialistas || !dadosOriginais.especialistas) return;

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
    if (!camadasVisiveis.rotas || !map) return 0;

    const especialistas = dadosOriginais.especialistas.reduce((acc, e) => {
        if (e.latitude_base && e.longitude_base) {
            acc[e.nome] = { lat: e.latitude_base, lon: e.longitude_base };
        }
        return acc;
    }, {});

    let distanciaTotalAcumulada = 0;

    for (const fazenda of Object.values(fazendasAgrupadas)) {
        const especialistaInfo = especialistas[fazenda.especialista];
        if (especialistaInfo) {
            const cor = getCorEspecialista(fazenda.especialista);
            const start = `${especialistaInfo.lon},${especialistaInfo.lat}`;
            const end = `${fazenda.centroideGeral[1]},${fazenda.centroideGeral[0]}`;
            
            try {
                const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`);
                if (!response.ok) throw new Error('Falha na API de roteamento');
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    L.geoJSON(data.routes[0].geometry, { style: { color: cor, weight: 4, opacity: 0.6 } }).addTo(camadasVisiveis.rotas);
                    distanciaTotalAcumulada += data.routes[0].distance;
                } else { throw new Error('Nenhuma rota encontrada'); }
            } catch (error) {
                console.warn(`Fallback para linha reta para ${fazenda.nome}:`, error.message);
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

function criarIconeEspecialista(cor) {
    return L.divIcon({ 
        className: 'custom-marker', 
        html: `<div style="background-color: ${cor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;"><i class="fas fa-user"></i></div>`, 
        iconSize: [30, 30], 
        iconAnchor: [15, 15] 
    });
}

function criarIconeFazenda(cor) {
    return L.divIcon({ 
        className: 'custom-marker', 
        html: `<div style="font-size: 24px; color: ${cor}; text-shadow: 0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white;"><i class="fas fa-tractor"></i></div>`, 
        iconSize: [24, 24], 
        iconAnchor: [12, 12] 
    });
}

function calcularDistancias(especialista, fazendas) {
    if (!map || !especialista.latitude_base) return { maxDist: 0, avgDist: 0 };

    const distancias = fazendas.map(f => {
        const p1 = L.latLng(especialista.latitude_base, especialista.longitude_base);
        const p2 = L.latLng(f.centroideGeral[0], f.centroideGeral[1]);
        return map.distance(p1, p2);
    });
    const maxDist = Math.max(...distancias);
    const avgDist = distancias.reduce((a, b) => a + b, 0) / distancias.length;
    return { maxDist, avgDist };
}

function atualizarEstatisticas(fazendasAgrupadas, distanciaTotal) {
    if (!fazendasAgrupadas) return;

    const totalUnidades = Object.keys(fazendasAgrupadas).length;
    const totalEspecialistas = new Set(Object.values(fazendasAgrupadas).map(f => f.especialista)).size;
    const distanciaMedia = totalUnidades > 0 ? distanciaTotal / totalUnidades : 0;

    const totalUnidadesElement = document.getElementById('total-unidades');
    const totalEspecialistasElement = document.getElementById('total-especialistas');
    const distanciaMediaElement = document.getElementById('distancia-media');

    if (totalUnidadesElement) totalUnidadesElement.textContent = totalUnidades;
    if (totalEspecialistasElement) totalEspecialistasElement.textContent = totalEspecialistas;
    if (distanciaMediaElement) distanciaMediaElement.textContent = formatarDistancia(distanciaMedia);
}

function criarLegenda() {
    const legendaContent = document.getElementById('legend-content');
    if (!legendaContent || !dadosFiltrados) return;
    
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

    const gestorSel = document.getElementById('gestor-filter')?.value || '';
    const especialistaSel = document.getElementById('especialista-filter')?.value || '';
    
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
    const addListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Elemento com ID ${id} não encontrado para listener`);
        }
    };

    // Filtros principais
    addListener('gestor-filter', 'change', aplicarFiltros);
    addListener('especialista-filter', 'change', aplicarFiltros);
    addListener('resetar-filtros', 'click', () => {
        const gestorFilter = document.getElementById('gestor-filter');
        const especialistaFilter = document.getElementById('especialista-filter');
        if (gestorFilter) gestorFilter.value = '';
        if (especialistaFilter) especialistaFilter.value = '';
        if (dadosOriginais) {
            dadosFiltrados = JSON.parse(JSON.stringify(dadosOriginais));
            processarDados();
        }
    });

    // Camadas base
    document.querySelectorAll('input[name="base-layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            Object.values(camadasBase).forEach(camada => map.removeLayer(camada));
            camadasBase[this.value].addTo(map);
        });
    });

    // Controles de camadas
    addListener('show-colaboradores', 'change', e => toggleLayer(camadasVisiveis.especialistas, e.target.checked));
    addListener('show-fazendas', 'change', e => toggleLayer(camadasVisiveis.fazendas, e.target.checked));
    addListener('show-rotas', 'change', e => toggleLayer(camadasVisiveis.rotas, e.target.checked));
    addListener('show-areas', 'change', e => toggleLayer(camadasVisiveis.areas, e.target.checked));

    // Gerenciamento de usuários
    addListener('open-user-management', 'click', function() {
        const container = document.getElementById('user-management-container');
        if (container) {
            container.style.display = 'block';
            ReactDOM.render(
                React.createElement(UserManagement),
                document.getElementById('user-management-root')
            );
        }
    });

    addListener('close-user-management', 'click', function() {
        const container = document.getElementById('user-management-container');
        if (container) container.style.display = 'none';
    });
}

function preencherFiltros() {
    if (!dadosOriginais) return;

    const gestorSelect = document.getElementById('gestor-filter');
    const especialistaSelect = document.getElementById('especialista-filter');
    if (!gestorSelect || !especialistaSelect) return;
    
    gestorSelect.innerHTML = '<option value="">Todos</option>';
    especialistaSelect.innerHTML = '<option value="">Todos</option>';
    
    [...new Set(dadosOriginais.especialistas.map(e => e.gestor))].filter(Boolean).sort().forEach(g => {
        gestorSelect.add(new Option(g, g));
    });
    
    [...new Set(dadosOriginais.fazendas.map(f => f.especialista))].filter(Boolean).sort().forEach(e => {
        especialistaSelect.add(new Option(e, e));
    });
}

function toggleLayer(layer, isVisible) {
    if (!map || !layer) return;
    if (isVisible) map.addLayer(layer); 
    else map.removeLayer(layer);
}

function ajustarVisualizacao(fazendasAgrupadas) {
    if (!map || !fazendasAgrupadas) return;

    const bounds = new L.LatLngBounds();
    Object.values(fazendasAgrupadas).forEach(f => bounds.extend(f.centroideGeral));
    
    if (dadosOriginais?.especialistas) {
        dadosOriginais.especialistas.forEach(e => {
            if (e.latitude_base && e.longitude_base && dadosFiltrados.fazendas.some(f => f.especialista === e.nome)) {
                bounds.extend([e.latitude_base, e.longitude_base]);
            }
        });
    }
    
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
}

function mostrarLoading(mostrar) {
    const loadingElement = document.getElementById('loading-overlay');
    if (loadingElement) {
        loadingElement.classList.toggle('hidden', !mostrar);
    }
}

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
function inicializarAplicacao() {
    // Verificar elementos essenciais
    const elementosEssenciais = ['map', 'user-management-root'];
    const elementosFaltantes = elementosEssenciais.filter(id => !document.getElementById(id));

    if (elementosFaltantes.length > 0) {
        console.error('Elementos do DOM não encontrados:', elementosFaltantes);
        
        const mensagem = document.createElement('div');
        mensagem.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: #ff4444;
            color: white;
            padding: 15px;
            z-index: 9999;
            text-align: center;
        `;
        mensagem.textContent = `Erro: Elementos (${elementosFaltantes.join(', ')}) não encontrados. Verifique o HTML.`;
        document.body.prepend(mensagem);
        return;
    }

    try {
        console.log('Inicializando aplicação...');
        inicializarMapa();
        carregarDados();
        configurarEventListeners();
        
        // Renderização inicial do React
        const userManagementRoot = document.getElementById('user-management-root');
        if (userManagementRoot) {
            ReactDOM.render(
                React.createElement(UserManagement),
                userManagementRoot
            );
        }
        
        console.log('Aplicação inicializada com sucesso');
    } catch (error) {
        console.error('Erro durante a inicialização:', error);
        alert('Erro crítico ao iniciar a aplicação. Verifique o console para detalhes.');
    }
}

// Iniciar a aplicação quando o DOM estiver pronto
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(inicializarAplicacao, 0);
} else {
    document.addEventListener('DOMContentLoaded', inicializarAplicacao);
}