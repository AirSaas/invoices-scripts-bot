const OpenAI = require("openai");
const { log } = require("../utils/logger");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model = "gpt-4o-mini";
//const model = "gpt-5";

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
  // La respuesta de la API puede venir como un string JSON que necesita ser parseado.
  // Asegúrate de que la respuesta contenga los datos esperados.
  const content = JSON.parse(response.choices[0].message.content);
  log(`selectorAI CONTENT_FROM_AI ${JSON.stringify(content)}`);
  return content.candidates || []; // Asumiendo que la IA devuelve un objeto con una clave "candidates"
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
  const content = JSON.parse(response.choices[0].message.content);
  return content.selectors || []; // Asumiendo que la IA devuelve una clave "selectors"
}

module.exports = { findCandidateElements, getCssSelectors };
