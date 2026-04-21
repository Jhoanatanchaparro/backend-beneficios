const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

function leerDB() {
    const data = JSON.parse(fs.readFileSync("db.json"));

    if (!Array.isArray(data.Beneficiarios_DB)) data.Beneficiarios_DB = [];
    if (!Array.isArray(data.Solicitudes_Beneficio)) data.Solicitudes_Beneficio = [];

    return data;
}

function guardarDB(data) {
    fs.writeFileSync("db.json", JSON.stringify(data, null, 2));
}

app.get("/beneficiarios/:doc", (req, res) => {
    const db = leerDB();

    const b = db.Beneficiarios_DB.find(x => x.NumeroDocumento === req.params.doc);

    if (!b) return res.status(404).json({ error: "No existe" });

    res.json(b);
});

app.post("/solicitudes", (req, res) => {

    const { NumeroDocumento, TipoBeneficio } = req.body;

    if (!NumeroDocumento || !TipoBeneficio) {
        return res.status(400).json({ error: "Datos incompletos" });
    }

    const db = leerDB();

    const beneficiario = db.Beneficiarios_DB.find(
        b => b.NumeroDocumento === NumeroDocumento
    );

    if (!beneficiario) {
        return res.status(404).json({ error: "Beneficiario no existe" });
    }

    const pendiente = db.Solicitudes_Beneficio.find(
        s => s.BeneficiarioID === beneficiario.ID && !s.Procesado
    );

    if (pendiente) {
        return res.status(400).json({
            error: "Ya existe una solicitud en proceso"
        });
    }

    const id = Date.now();

    const nueva = {
        ID: id,
        BeneficiarioID: beneficiario.ID,
        TipoBeneficio,
        Estado: "Pendiente",
        ScoreElegibilidad: null,
        Folio: `SB-${new Date().getFullYear()}-${id}`,
        FechaRespuesta: null,
        Procesado: false,
        MotivoDecision: "",
        NumReintentos: 0
    };

    db.Solicitudes_Beneficio.push(nueva);
    guardarDB(db);

    res.json(nueva);
});

app.get("/solicitudes", (req, res) => {
    const db = leerDB();

    const data = db.Solicitudes_Beneficio.map(s => {
        const b = db.Beneficiarios_DB.find(x => x.ID === s.BeneficiarioID);

        return {
            ...s,
            NumeroDocumento: b?.NumeroDocumento,
            NombreCompleto: b?.NombreCompleto
        };
    });

    res.json(data);
});

app.post("/api/beneficio/evaluar", (req, res) => {

    const {
        solicitudId,
        tipoBeneficio,
        ingresosMensuales,
        estrato,
        nucleoFamiliar,
        fechaNacimiento
    } = req.body;

    if (!solicitudId || !tipoBeneficio || ingresosMensuales == null || !estrato || !nucleoFamiliar || !fechaNacimiento) {
        return res.status(400).json({ error: "Campos faltantes" });
    }

    let edad = new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();

    let score = 0;
    let motivos = [];

    const reglas = [
        { c: ingresosMensuales <= 1000000, p: 30, d: "Ingresos bajos" },
        { c: ingresosMensuales <= 2000000 && ingresosMensuales > 1000000, p: 15, d: "Ingresos medios" },
        { c: estrato <= 2, p: 25, d: "Estrato bajo" },
        { c: nucleoFamiliar >= 4, p: 20, d: "Familia numerosa" },
        { c: edad > 60, p: 15, d: "Adulto mayor" },
        { c: tipoBeneficio === "Vivienda" && estrato <= 2, p: 10, d: "Prioridad vivienda" }
    ];

    for (let r of reglas) {
        if (r.c) {
            score += r.p;
            motivos.push("✔ " + r.d);
        } else {
            motivos.push("✘ " + r.d);
        }
    }

    let estado = "Rechazado";
    if (score >= 60) estado = "Aprobado";
    else if (score >= 30) estado = "En revisión";

    setTimeout(() => {
        res.json({
            solicitudId,
            score,
            estado,
            motivoDecision: motivos.join(", ")
        });
    }, 3000);
});

setInterval(async () => {

    const db = leerDB();

    for (let s of db.Solicitudes_Beneficio) {

        if (!s.Procesado) {

            const b = db.Beneficiarios_DB.find(x => x.ID === s.BeneficiarioID);
            if (!b) continue;

            try {
                const r = await fetch(`http://localhost:${PORT}/api/beneficio/evaluar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        solicitudId: s.ID,
                        tipoBeneficio: s.TipoBeneficio,
                        ingresosMensuales: b.IngresosMensuales,
                        estrato: b.Estrato,
                        nucleoFamiliar: b.NucleoFamiliar,
                        fechaNacimiento: b.FechaNacimiento
                    })
                });

                const data = await r.json();

                s.Estado = data.estado;
                s.ScoreElegibilidad = data.score;
                s.MotivoDecision = data.motivoDecision;
                s.Procesado = true;
                s.FechaRespuesta = new Date().toISOString();

            } catch {
                s.NumReintentos++;
            }
        }
    }

    guardarDB(db);

}, 5000);

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});