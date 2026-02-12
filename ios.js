const privacy = require('./lib/privacy');

// ID WhatsApp (ha molti dati privacy)
privacy({ id: 310633997, country: 'US' })
    .then(data => {
        console.log(JSON.stringify(data, null, 2));
    })
    .catch(console.error);
