const OpenAI = require("openai");
const { log } = require("../utils/logger");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model = "gpt-4o-mini";
//const model = "gpt-5";

function safeParseJSON(raw, fallback, label) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    log(`selectorAI JSON_PARSE_ERROR [${label}]: ${e.message}`);
    log(`selectorAI RAW_RESPONSE [${label}]: ${raw ? raw.substring(0, 500) : 'null'}`);
    return fallback;
  }
}

async function findCandidateElements(html) {
  const prompt = `Analiza el siguiente HTML y devuelve un array JSON de objetos llamado 'candidates'. Cada objeto debe representar un elemento que probablemente sea un enlace o botón para descargar una factura en PDF o un archivo similar. Incluye solo elementos con texto como "factura", "invoice", "descargar", "download", "PDF", o con atributos href ó onclick a "window.open" que apunten a una descarga.

  **Excluye explícitamente cualquier enlace cuyo atributo href comience con 'mailto:'. No nos interesan los vínculos de correo electrónico.**

  Para cada elemento, extrae la etiqueta (tag), el texto (text), y todos sus atributos (attributes). El JSON debe estar limpio, sin texto adicional antes o después.`;
  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: html,
      },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0].message.content;
  const content = safeParseJSON(raw, { candidates: [] }, 'findCandidateElements');
  log(`selectorAI CANDIDATES_COUNT: ${(content.candidates || []).length}`);
  return content.candidates || [];
}

async function getCssSelectors(candidates) {
  const prompt = `A partir del siguiente array JSON de elementos HTML, genera un array JSON de selectores CSS robustos y priorizados para hacer clic y descargar un archivo llamado 'selectors'.

REGLAS IMPORTANTES:
1. MÁXIMA PRIORIDAD: Enlaces de Stripe (pay.stripe.com) que contienen /invoice/ y /pdf - usar selectores como 'a[href*="pay.stripe.com/invoice"]'
2. Prioriza enlaces directos a .pdf, .xlsx o archivos conocidos
3. Prioriza atributos estables como 'data-*', 'id', o 'onclick'
4. Para hacer coincidir por texto, usa ':has-text("texto exacto")' - NO uses :contains()
5. NO incluyas espacios innecesarios en los selectores (ej: 'a[href$=".pdf"]' NO 'a[href $= ".pdf"]')
6. Si hay onclick con window.open, incluye selectores como 'a[onclick*="window.open"]'
7. SOPORTE MULTIIDIOMA: Considera texto en español, inglés y francés para términos de descarga

EJEMPLOS VÁLIDOS PRIORIZADOS:
- a[href*="pay.stripe.com/invoice"] (MÁXIMA PRIORIDAD para facturas de Stripe)
- a[href*="stripe.com/invoice"]
- a[href*="/invoice/"][href*="/pdf"]
- a[href$=".pdf"]
- a[onclick*="window.open"]
- a:has-text("Download sample file")
- a:has-text("Descargar archivo")
- a:has-text("Télécharger fichier")

TÉRMINOS DE DESCARGA COMUNES:
- Español: "Descargar", "Bajar", "Archivo", "Plantilla", "Ejemplo"
- Inglés: "Download", "Get", "File", "Template", "Sample"
- Francés: "Télécharger", "Fichier", "Modèle", "Exemple"

Devuelve exactamente un máximo de 8 selectores como un array de strings. El JSON debe estar limpio, sin texto adicional.`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: JSON.stringify(candidates),
      },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0].message.content;
  const content = safeParseJSON(raw, { selectors: [] }, 'getCssSelectors');
  const selectors = content.selectors || [];
  log(`selectorAI SELECTORS_COUNT: ${selectors.length}`);
  if (selectors.length > 0) {
    log(`selectorAI SELECTORS: ${selectors.join(', ')}`);
  }
  return selectors;
}

async function findPaginationElement(html) {
  const prompt = `Analyze the following HTML and determine if there is a pagination element to navigate to the next page of results (invoices, billing history, etc.).

LOOK FOR:
1. "Next" / "Suivant" / "Siguiente" buttons or links
2. Arrow icons or chevrons (→, >, ›, chevron-right, arrow-right)
3. Numbered page links (1, 2, 3...) — return the selector for the NEXT page number
4. "Load more" / "Charger plus" / "Ver más" / "Afficher plus" buttons
5. "Show more" / "Voir plus" / "Mostrar más" buttons
6. Any element with aria-label or title indicating "next page" in any language
7. Scroll containers with lazy-loaded content (infinite scroll indicators)

RETURN a JSON object with:
- "found": boolean — true if pagination element exists
- "type": string — "next_button", "page_number", "load_more", "infinite_scroll", or "none"
- "selector": string — CSS selector for the element to click (null if type is "infinite_scroll" or "none")
- "reason": string — brief explanation of what was found

RULES:
- Use ':has-text("exact text")' for text matching, NOT :contains()
- No spaces in attribute selectors
- Prefer stable selectors (data-*, id, aria-label)
- Support French, English, and Spanish text
- If multiple pagination elements exist, prefer "Next" button over page numbers
- Do NOT return disabled or greyed-out pagination elements (check for disabled, aria-disabled, class*="disabled")
- If no pagination is found, return found: false`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: html,
      },
    ],
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0].message.content;
  const defaultPagination = { found: false, type: "none", selector: null, reason: "JSON parse failed" };
  const content = safeParseJSON(raw, defaultPagination, 'findPaginationElement');

  // Validate and normalize the response
  const result = {
    found: content.found === true,
    type: content.type || "none",
    selector: content.selector || null,
    reason: content.reason || "unknown",
  };

  log(`selectorAI PAGINATION_RESULT found=${result.found} type="${result.type}" selector="${result.selector}" reason="${result.reason}"`);
  return result;
}

module.exports = { findCandidateElements, getCssSelectors, findPaginationElement };
