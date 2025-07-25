// Gerencia a abertura/fechamento do painel
document.getElementById('open-user-management').addEventListener('click', function() {
    document.getElementById('user-management-container').style.display = 'block';
});

document.getElementById('close-user-management').addEventListener('click', function() {
    document.getElementById('user-management-container').style.display = 'none';
});

// Renderiza o componente principal
function UserManagementApp() {
    return (
        <div style={{padding: '20px', background: 'white', margin: '10px', borderRadius: '5px'}}>
            <UserList />
        </div>
    );
}

ReactDOM.render(<UserManagementApp />, document.getElementById('user-management-root'));