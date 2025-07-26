// ===================================================================
//  ARQUIVO: script.js (VERSÃO ATUALIZADA - LÓGICA V12 + CIDADES PRÓXIMAS + INTERFACE MODERNA)
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
    url: 'https://script.google.com/macros/s/AKfycbyf53m_7dKNb-QujqvKlHmEYyiPasAY861nhtGdCK24NPJE3dXYhksI9VEksh7pmj0P9w/exec'
};

// --- SERVIÇO DE API HÍBRIDO ---
const APIService = {
    fetchData: async () => {
        try {
            // MUDANÇA AQUI: Em vez de ler do JSONBin, lemos direto do Google.
            const response = await fetch(GOOGLE_SCRIPT_CONFIG.url); 
            if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
            const data = await response.json();
            // A resposta do Google já vem no formato correto, não precisa do '.record'
            return data; 
        } catch (error) {
            // MUDANÇA AQUI: A mensagem de erro agora aponta para o Google Script.
            console.error("Falha ao buscar dados do Google Script:", error);
            alert(`Não foi possível carregar os dados do mapa: ${error.message}. Verifique a URL do Google Script.`);
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
             alert('Entrada adicionada com sucesso! A página será recarregada para mostrar a atualização.');
        window.location.reload(); // Recarrega a página automaticamente
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
let cidadesBrasil = null; // NOVO: Dados das cidades brasileiras
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

// NOVO: Função para carregar dados das cidades brasileiras
async function carregarCidadesBrasil() {
    try {
        const response = await fetch('cidadebrasil.geojson');
        if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
        const data = await response.json();
        cidadesBrasil = data.features;
        console.log(`Carregadas ${cidadesBrasil.length} cidades brasileiras`);
    } catch (error) {
        console.error('Erro ao carregar dados das cidades:', error);
        cidadesBrasil = [];
    }
}

// NOVO: Função para calcular distância entre duas coordenadas (Haversine)
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em metros
}

// NOVO: Função para encontrar a cidade mais próxima de uma coordenada
function encontrarCidadeMaisProxima(lat, lon) {
    if (!cidadesBrasil || cidadesBrasil.length === 0) {
        return { nome: 'Não encontrada', distancia: 0 };
    }
    
    let cidadeMaisProxima = null;
    let menorDistancia = Infinity;
    
    cidadesBrasil.forEach(cidade => {
        const cidadeLat = cidade.geometry.coordinates[1];
        const cidadeLon = cidade.geometry.coordinates[0];
        const distancia = calcularDistanciaHaversine(lat, lon, cidadeLat, cidadeLon);
        
        if (distancia < menorDistancia) {
            menorDistancia = distancia;
            cidadeMaisProxima = cidade.properties.nome;
        }
    });
    
    return {
        nome: cidadeMaisProxima || 'Não encontrada',
        distancia: menorDistancia
    };
}

function getCorEspecialista(nome) {
    if (!nome) return '#95a5a6'; // Cor padrão para dados inválidos

    const nomeNormalizado = String(nome).trim().toUpperCase();

    // 1. Verifica se a cor já existe (no objeto original ou já gerada)
    if (coresEspecialistas[nomeNormalizado]) {
        return coresEspecialistas[nomeNormalizado];
    }

    // 2. Se não existe, gera uma cor nova e aleatória
    // Esta fórmula gera cores vibrantes e evita tons muito claros ou escuros
    const hue = Math.floor(Math.random() * 360); // Matiz de 0 a 360 (círculo de cores)
    const saturation = Math.floor(Math.random() * 30) + 70; // Saturação de 70% a 100% (viva)
    const lightness = Math.floor(Math.random() * 20) + 50;  // Luminosidade de 50% a 70% (nem muito escura, nem muito clara)
    
    const novaCor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    // 3. Armazena a nova cor para uso futuro nesta sessão
    console.log(`Nova cor gerada para ${nomeNormalizado}: ${novaCor}`);
    coresEspecialistas[nomeNormalizado] = novaCor;

    return novaCor;
}

function formatarDistancia(distanciaEmMetros) {
    if (isNaN(distanciaEmMetros)) return 'N/A';
    return (distanciaEmMetros / 1000).toFixed(1) + ' km';
}

// NOVO: Função para calcular tempo de deslocamento estimado
function calcularTempoDeslocamento(distanciaEmMetros) {
    if (isNaN(distanciaEmMetros)) return 'N/A';
    // Assumindo velocidade média de 60 km/h
    const velocidadeMedia = 60; // km/h
    const distanciaEmKm = distanciaEmMetros / 1000;
    const tempoEmHoras = distanciaEmKm / velocidadeMedia;
    
    if (tempoEmHoras < 1) {
        return Math.round(tempoEmHoras * 60) + ' min';
    } else {
        const horas = Math.floor(tempoEmHoras);
        const minutos = Math.round((tempoEmHoras - horas) * 60);
        return `${horas}h${minutos > 0 ? ` ${minutos}min` : ''}`;
    }
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
    
    // Carregar dados das cidades primeiro
    await carregarCidadesBrasil();
    
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
                
                // NOVO: Calcular cidade mais próxima da unidade
                const cidadeProxima = encontrarCidadeMaisProxima(lat, lon);
                
                dadosOriginais.fazendas.push({
                    nome: item.UNIDADE,
                    especialista: item.ESPECIALISTA,
                    cidade_origem: item.CIDADE_BASE,
                    centroide: [lat, lon],
                    geometria: { type: "Point", coordinates: [lon, lat] },
                    // NOVO: Informações da cidade mais próxima
                    cidadeMaisProxima: cidadeProxima.nome,
                    distanciaCidadeProxima: cidadeProxima.distancia,
                    // NOVO: Informação do grupo (pode ser adicionada posteriormente)
                    grupo: item.GRUPO,
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
                nome: p.nome, 
                especialista: p.especialista, 
                cidade_origem: p.cidade_origem,
                poligonos: [], 
                centroides: [],
                // NOVO: Informações adicionais
                cidadeMaisProxima: p.cidadeMaisProxima,
                distanciaCidadeProxima: p.distanciaCidadeProxima,
                grupo: p.grupo
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

// ATUALIZADO: Função para criar pop-up moderno da fazenda
// ATUALIZADO: Função para criar pop-up moderno da fazenda
function criarPopupFazenda(fazenda) {
    const especialistaInfo = dadosOriginais.especialistas.find(e => e.nome === fazenda.especialista);
    let distanciaBase = 'N/A';
    let tempoDeslocamento = 'N/A';
    
    if (especialistaInfo && especialistaInfo.latitude_base && especialistaInfo.longitude_base && fazenda.centroideGeral) {
        const pontoEspecialista = L.latLng(especialistaInfo.latitude_base, especialistaInfo.longitude_base);
        const pontoFazenda = L.latLng(fazenda.centroideGeral[0], fazenda.centroideGeral[1]);
        const distanciaEmMetros = map.distance(pontoEspecialista, pontoFazenda);
        distanciaBase = formatarDistancia(distanciaEmMetros);
        tempoDeslocamento = calcularTempoDeslocamento(distanciaEmMetros);
    }
    
    return `
        <div class="popup-moderno">
            <div class="popup-header">
                <h3><i class="fas fa-tractor"></i> ${fazenda.nome}</h3>
                <span class="popup-grupo">${fazenda.grupo || 'N/A'}</span>
            </div>
            <div class="popup-content">
                <div class="popup-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Localização</h4>
                    <p><strong>Cidade de Origem:</strong> ${fazenda.cidade_origem || 'N/A'}</p>
                    <p><strong>Cidade Mais Próxima:</strong> ${fazenda.cidadeMaisProxima}</p>
                    <p><strong>Distância da Cidade Próxima:</strong> ${formatarDistancia(fazenda.distanciaCidadeProxima)}</p>
                </div>
                <div class="popup-section">
                    <h4><i class="fas fa-user"></i> Atendimento</h4>
                    <p><strong>Especialista:</strong> ${fazenda.especialista}</p>
                    <p><strong>Distância da Base:</strong> ${distanciaBase}</p>
                    <p><strong>Tempo de Deslocamento:</strong> ${tempoDeslocamento}</p>
                    <p><strong>Grupo:</strong> ${fazenda.grupo || 'N/A'}</p>
                </div>
            </div>
        </div>
    `;
}

// ATUALIZADO: Função para criar pop-up moderno do especialista
function criarPopupEspecialista(especialista, fazendasAtendidas) {
    const { maxDist, avgDist } = calcularDistancias(especialista, fazendasAtendidas);
    const listaFazendasHtml = fazendasAtendidas.map(f => `<li>${f.nome}</li>`).join('');
    
    return `
        <div class="popup-moderno">
            <div class="popup-header">
                <h3><i class="fas fa-user"></i> ${especialista.nome}</h3>
                <span class="popup-especialista">Especialista</span>
            </div>
            <div class="popup-content">
                <div class="popup-section">
                    <h4><i class="fas fa-map-marker-alt"></i> Informações da Rota</h4>
                    <p><strong>Cidade Base:</strong> ${especialista.cidade_base || 'N/A'}</p>
                    <p><strong>Raio de Atuação:</strong> ${formatarDistancia(maxDist)}</p>
                    <p><strong>Distância Média:</strong> ${formatarDistancia(avgDist)}</p>
                    <p><strong>Tempo Médio de Deslocamento:</strong> ${calcularTempoDeslocamento(avgDist)}</p>
                </div>
                <div class="popup-section">
                    <h4><i class="fas fa-list"></i> Atendimento</h4>
                    <p><strong>Unidades Atendidas:</strong> ${fazendasAtendidas.length}</p>
                    <div class="popup-lista">
                        <strong>Fazendas:</strong>
                        <ul>${listaFazendasHtml}</ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function desenharFazendasEIcones(fazendasAgrupadas) {
    if (!camadasVisiveis.fazendas || !map) return;
    Object.values(fazendasAgrupadas).forEach(fazenda => {
        if (!fazenda.centroideGeral) return;
        const cor = getCorEspecialista(fazenda.especialista);
        
        L.marker(fazenda.centroideGeral, { icon: criarIconeFazenda(cor) })
            .bindPopup(criarPopupFazenda(fazenda))
            .addTo(camadasVisiveis.fazendas);
    });
}

function desenharEspecialistas(fazendasAgrupadas) {
    if (!camadasVisiveis.especialistas || !dadosOriginais.especialistas) return;
    dadosOriginais.especialistas.forEach(especialista => {
        const fazendasAtendidas = Object.values(fazendasAgrupadas).filter(f => f.especialista === especialista.nome);
        if (fazendasAtendidas.length === 0 || !especialista.latitude_base) return;
        const cor = getCorEspecialista(especialista.nome);
        
        L.marker([especialista.latitude_base, especialista.longitude_base], { icon: criarIconeEspecialista(cor) })
            .bindPopup(criarPopupEspecialista(especialista, fazendasAtendidas))
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

