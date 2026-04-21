const express = require("express");
const app = express();
app.use(express.json());

app.post("/api/beneficio/evaluar", (req, res) => {
    console.log("BODY:", req.body); 
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "Body vacío o mal enviado" });
    }
    const {
        solicitudId,
        tipoBeneficio,
        ingresosMensuales,
        estrato,
        nucleoFamiliar,
        fechaNacimiento
    } = req.body;

    console.log(`Solicitud ${solicitudId} recibida - ${new Date()} - ${tipoBeneficio}`);

    // VALIDACIONES
    if (!solicitudId || !tipoBeneficio || ingresosMensuales == null || !estrato || !nucleoFamiliar || !fechaNacimiento) {
        return res.status(400).json({ error: "Campos faltantes" });
    }

    if (ingresosMensuales <= 0) {
        return res.status(400).json({ error: "Ingresos inválidos" });
    }

    if (estrato < 1 || estrato > 6) {
        return res.status(400).json({ error: "Estrato inválido" });
    }

    let score = 0;
    let motivos = [];

    const edad = new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();

    const reglas = [
        {
            condicion: ingresosMensuales <= 1000000,
            puntos: 30,
            descripcion: "Ingresos bajos"
        },
        {
            condicion: ingresosMensuales > 1000000 && ingresosMensuales <= 2000000,
            puntos: 15,
            descripcion: "Ingresos medios"
        },
        {
            condicion: estrato <= 2,
            puntos: 25,
            descripcion: "Estrato bajo"
        },
        {
            condicion: nucleoFamiliar >= 4,
            puntos: 20,
            descripcion: "Familia numerosa"
        },
        {
            condicion: edad > 60,
            puntos: 15,
            descripcion: "Adulto mayor"
        },
        {
            condicion: tipoBeneficio === "Vivienda" && estrato <= 2,
            puntos: 10,
            descripcion: "Prioridad vivienda"
        }
    ];

    for (let i = 0; i < reglas.length; i++) {
        if (reglas[i].condicion) {
            score += reglas[i].puntos;
            motivos.push(`✔ ${reglas[i].descripcion}`);
        } else {
            motivos.push(`✘ ${reglas[i].descripcion}`);
        }
    }

    let estado = "";
    if (score >= 60) estado = "Aprobado";
    else if (score >= 30) estado = "En revisión";
    else estado = "Rechazado";

    setTimeout(() => {
        res.json({
            solicitudId,
            score,
            estado,
            motivoDecision: motivos.join(", ")
        });
    }, Math.floor(Math.random() * 3000) + 3000);
});

app.listen(3000, () => console.log("Servidor corriendo en puerto 3000"));