/**
 * GERADOR DE JORNAL - VERSÃO GRID 3 COLUNAS
 * Correções:
 *  - Fonte Inter via Google Fonts (sem dependência de arquivos locais)
 *  - Ordenação pela coluna "ordem farma" da planilha
 *  - Dimensão base 1080px de largura, escalado proporcionalmente
 *  - Cards completamente visíveis no grid (sem corte)
 */

// Dimensões originais do card (px)
const CARD_W = 700;
const CARD_H = 1058;

// Largura total do jornal (px)
const JORNAL_W = 1080;

// Número de colunas
const COLUNAS = 3;

// Gap entre colunas (px)
const GAP = 20;

// Largura de cada célula no grid, considerando o gap
const CELL_W = (JORNAL_W - GAP * (COLUNAS - 1)) / COLUNAS;  // ≈ 346.67px

// Escala proporcional
const SCALE = CELL_W / CARD_W;  // ≈ 0.4952

// Altura que o wrapper precisa ter para acomodar o card escalado completamente
const CELL_H = Math.ceil(CARD_H * SCALE);  // ≈ 524px

// ─────────────────────────────────────────────────────────

async function processarPlanilha() {
    const fileInput = document.getElementById('upload');
    const file = fileInput.files[0];

    if (!file) {
        alert("Por favor, selecione uma planilha .xlsx.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Usa a primeira aba disponível
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            let jsonData = XLSX.utils.sheet_to_json(sheet);

            if (!jsonData || jsonData.length === 0) {
                alert("A planilha está vazia.");
                return;
            }

            // Ordenação pela coluna "ordem farma" (prioridade) ou fallbacks
            jsonData.sort((a, b) => {
                const ordemA = parseFloat(a['ordem farma'] ?? a['ordem varejo'] ?? a['ordem'] ?? 999);
                const ordemB = parseFloat(b['ordem farma'] ?? b['ordem varejo'] ?? b['ordem'] ?? 999);
                return ordemA - ordemB;
            });

            await gerarJornalGrid(jsonData);

        } catch (err) {
            console.error(err);
            alert("Erro ao processar planilha: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ─────────────────────────────────────────────────────────

async function carregarTemplate(tipo) {
    const mapeamento = {
        'cupom':    'cupom.html',
        'queda':    'queda.html',
        'cashback': 'cashback.html',
        'bc':       'bc.html',
        'card':     'card.html',
    };

    let nomeArquivo = 'promocao.html';
    const tipoNorm = (tipo || '').toLowerCase().trim();

    for (const [chave, arquivo] of Object.entries(mapeamento)) {
        if (tipoNorm.includes(chave)) {
            nomeArquivo = arquivo;
            break;
        }
    }

    try {
        const res = await fetch(`templates/${nomeArquivo}`);
        if (res.ok) return await res.text();
    } catch (_) {}

    try {
        const res = await fetch('templates/promocao.html');
        if (res.ok) return await res.text();
    } catch (_) {}

    return "";
}

// ─────────────────────────────────────────────────────────

// Link do Google Fonts para Inter
const INTER_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">`;

function preencherTemplate(html, item) {
    const s = (v) => {
        if (v === undefined || v === null) return '';
        const str = String(v).trim();
        return (str === 'nan' || str === 'NaN' || str === '-') ? '' : str;
    };

    const logo = s(item['logo'] || item['FORNECEDOR '] || item['FORNECEDOR']);
    const logoSrc = logo && !logo.startsWith('http') ? `assets/${logo}.png` : logo;

    const dados = {
        'LOGO':        logoSrc,
        'TEXTO':       s(item['texto']),
        'VALOR':       s(item['valor']),
        'COMPLEMENTO': s(item['complemento']),
        'LEGAL':       s(item['legal']),
        'UF':          s(item['uf']),
        'URN':         s(item['urn']),
        'SEGMENTO':    s(item['segmento']),
        'CUPOM':       s(item['cupom']),
        'VIGENCIA':    s(item['VIGÊNCIA'] || item['vigencia'] || item['VIGENCIA']),
        'SELO':        s(item['selo']),
    };

    let out = html;

    // 1. Remover blocos @font-face locais (Inter com ../fonts/)
    out = out.replace(/@font-face\s*\{[^}]*Inter[^}]*\}/g, '');

    // 2. Injetar Google Fonts se ainda não estiver presente
    if (!out.includes('fonts.googleapis.com')) {
        // Tenta inserir após <meta charset>
        const insertedAfterMeta = out.replace(/(<meta\s+charset[^>]*>)/i, `$1\n${INTER_LINK}`);
        out = insertedAfterMeta !== out ? insertedAfterMeta :
              out.replace(/<head>/i, `<head>\n${INTER_LINK}`);
    }

    // 3. Substituir placeholders {{CAMPO}}
    for (const [chave, valor] of Object.entries(dados)) {
        const regex = new RegExp(`\\{\\{${chave}\\}\\}`, 'g');
        out = out.replace(regex, valor);
    }

    return out;
}

// ─────────────────────────────────────────────────────────

async function gerarJornalGrid(data) {
    const container = document.getElementById('jornal');
    container.innerHTML = '<p style="text-align:center;padding:20px;">Gerando jornal...</p>';

    const templateCache = {};
    let htmlCards = '';

    for (const item of data) {
        const tipo = (item['tipo'] || item['TIPO'] || 'promocao').toString().trim();

        if (!templateCache[tipo]) {
            templateCache[tipo] = await carregarTemplate(tipo);
        }

        const cardHtml = preencherTemplate(templateCache[tipo], item);

        // Escapa aspas simples para uso em srcdoc
        const srcdocContent = cardHtml.replace(/'/g, "&#39;");

        htmlCards += `
        <div class="card-wrapper">
            <iframe
                srcdoc='${srcdocContent}'
                scrolling="no"
                loading="lazy"
            ></iframe>
        </div>`;
    }

    const gridStyles = buildGridStyles();

    const jornalHtml = `${gridStyles}
    <div class="jornal-grid-wrapper">
        <div class="grid-container">
            ${htmlCards}
        </div>
    </div>`;

    container.innerHTML = `
        <div style="text-align:center; margin-bottom: 20px;">
            <button class="btn-export" onclick="baixarJornal()">📥 Baixar Jornal (HTML)</button>
        </div>
        <div id="jornal-preview">${jornalHtml}</div>
    `;

    window._jornalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jornal de Ofertas</title>
${buildGridStyles()}
</head>
<body style="margin:0; background:#f0f2f5; padding:20px;">
<div class="jornal-grid-wrapper">
    <div class="grid-container">
        ${htmlCards}
    </div>
</div>
</body>
</html>`;
}

function buildGridStyles() {
    return `
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');

    .jornal-grid-wrapper {
        width: ${JORNAL_W}px;
        margin: 0 auto;
        font-family: 'Inter', sans-serif;
    }

    .grid-container {
        display: grid;
        grid-template-columns: repeat(${COLUNAS}, ${CELL_W.toFixed(4)}px);
        gap: ${GAP}px;
        width: ${JORNAL_W}px;
    }

    /* Wrapper: dimensões EXATAS do card após escala — sem corte */
    .card-wrapper {
        width: ${CELL_W.toFixed(4)}px;
        height: ${CELL_H}px;
        overflow: hidden;
        position: relative;
        border-radius: ${Math.round(40 * SCALE)}px;
        background: white;
    }

    /* iframe no tamanho nativo do card, depois escalado */
    .card-wrapper iframe {
        width: ${CARD_W}px;
        height: ${CARD_H}px;
        border: none;
        display: block;
        transform: scale(${SCALE.toFixed(6)});
        transform-origin: top left;
        overflow: hidden;
        pointer-events: none;
    }
</style>`;
}

// ─────────────────────────────────────────────────────────

function baixarJornal() {
    if (!window._jornalHtml) return;
    const blob = new Blob([window._jornalHtml], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jornal_ofertas.html';
    a.click();
}
