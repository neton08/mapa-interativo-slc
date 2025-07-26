function UserList() {
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

    React.useEffect(() => {
        loadUsers();
    }, []);

    const handleAddGestor = async (gestorData) => {
        await UserService.addGestor(gestorData);
        loadUsers();
    };

    const handleAddColaborador = async (colabData) => {
        await UserService.addColaborador(colabData);
        loadUsers();
    };

    if (loading) return <div>Carregando...</div>;

    return (
        <div style={{padding: '20px'}}>
            <h1>Gerenciamento de Usuários</h1>
            
            <div style={{marginBottom: '40px'}}>
                <h2>Adicionar Novo Gestor</h2>
                <AddUserForm 
                    onAddUser={handleAddGestor} 
                    userType="gestor" 
                />
            </div>

            <div style={{marginBottom: '40px'}}>
                <h2>Adicionar Novo Colaborador</h2>
                <AddUserForm 
                    onAddUser={handleAddColaborador} 
                    userType="colaborador" 
                />
            </div>

            {/* Restante do código igual ao anterior */}
        </div>
    );
}