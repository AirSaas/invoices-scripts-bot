const OpenAI = require('openai');
const readline = require('readline');
const { log } = require('./logger');

const AVAILABLE_SITES = ['dropcontact', 'fullenrich', 'hyperline', 'bettercontact', 'sejda', 'dedupe'];

/**
 * Ask a question in the terminal and return the user's answer.
 */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Use OpenAI chat to understand which sites the user wants to run.
 * Supports multi-turn: if the AI isn't sure, it asks a follow-up question.
 *
 * @param {string} userInput - Natural language input (e.g. "drop et hyperline")
 * @returns {string[]} Array of canonical site names, or [] for "all"
 */
async function parseSiteFilter(userInput) {
  if (!userInput || !userInput.trim()) {
    return [];
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `Tu es un assistant qui aide à sélectionner des sites de facturation à scraper.

SITES DISPONIBLES : ${AVAILABLE_SITES.join(', ')}

CONTEXTE DE CHAQUE SITE :
- dropcontact : outil d'enrichissement de contacts B2B
- fullenrich : outil d'enrichissement de données
- hyperline : plateforme de facturation/billing SaaS
- bettercontact : outil de recherche de contacts
- sejda : outil de manipulation de PDF en ligne
- dedupe : outil de déduplication de données

RÈGLES :
1. L'utilisateur va te dire en langage naturel quels sites il veut lancer.
2. Tu dois répondre UNIQUEMENT en JSON valide, rien d'autre.
3. Si tu comprends clairement les sites demandés, réponds :
   {"sites": ["site1", "site2"], "question": null}
4. Si c'est ambigu ou que tu n'es pas sûr, pose UNE question de clarification :
   {"sites": [], "question": "Ta question ici ?"}
5. Si l'utilisateur dit "tous", "all", "tout", réponds :
   {"sites": [], "question": null}   (vide = tous les sites)
6. Si l'utilisateur mentionne un site qui n'existe PAS dans la liste (ex: "Amazon"), signale-le dans ta question.
7. Les noms peuvent être abrégés ou mal orthographiés : "drop" = dropcontact, "hyper" = hyperline, "better" = bettercontact, "full" = fullenrich, etc.
8. N'invente JAMAIS de site qui n'est pas dans la liste.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ];

  // Multi-turn loop: max 6 exchanges
  for (let turn = 0; turn < 6; turn++) {
    let response;
    try {
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
      });
    } catch (err) {
      log(`SITE_FILTER AI_ERROR: ${err.message}`);
      log(`SITE_FILTER FALLBACK: Running all sites`);
      return [];
    }

    const raw = response.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      log(`SITE_FILTER JSON_PARSE_ERROR: ${raw}`);
      return [];
    }

    // If the AI has a clarifying question, ask the user
    if (parsed.question) {
      log(`SITE_FILTER AI_QUESTION: ${parsed.question}`);
      const followUp = await ask(`\n🤖 ${parsed.question}\n👉 `);

      if (!followUp) {
        log('SITE_FILTER: No answer, running all sites');
        return [];
      }

      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: followUp });
      continue;
    }

    // AI returned sites
    const sites = (parsed.sites || []).filter(s => AVAILABLE_SITES.includes(s));
    if (sites.length > 0) {
      log(`SITE_FILTER: AI selected → ${sites.join(', ')}`);
    } else {
      log(`SITE_FILTER: Running all sites`);
    }
    return sites;
  }

  // Max turns reached
  log('SITE_FILTER: Max turns reached, running all sites');
  return [];
}

/**
 * Filter the scrapers list based on parsed site names.
 * If no filter (empty), returns all scrapers.
 */
function filterScrapers(scrapers, siteNames) {
  if (!siteNames || siteNames.length === 0) {
    return scrapers;
  }

  return scrapers.filter(s => {
    const name = (s.bot.SITE_NAME || s.name).toLowerCase();
    return siteNames.includes(name);
  });
}

module.exports = { parseSiteFilter, filterScrapers, AVAILABLE_SITES };
