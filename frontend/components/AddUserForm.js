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

    return (
        <div style={{ border: '1px solid #ccc', padding: '20px', marginBottom: '20px', borderRadius: '5px' }}>
            <form onSubmit={handleSubmit}>
                {/* Campos do formulário como no exemplo anterior */}
            </form>
        </div>
    );
}