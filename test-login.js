async function testLogin() {
    try {
        const response = await fetch('http://localhost:5100/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'password'
            })
        });
        const data = await response.json();
        console.log('Response:', response.status, data);
    } catch (error) {
        console.log('Error:', error.message);
    }
}

testLogin();
