import { extractText, getDocumentProxy } from 'unpdf';

/** Canonical skill name → patterns that mean it. Canonical names match the job skill tags. */
const SKILLS: Record<string, RegExp> = {
  React: /\breact(\.js|js)?\b/i,
  'Next.js': /\bnext\.?js\b/i,
  TypeScript: /\btypescript\b/i,
  JavaScript: /\bjavascript\b|\bjs\b/i,
  'Node.js': /\bnode(\.js|js)?\b/i,
  Express: /\bexpress(\.js|js)?\b/i,
  PostgreSQL: /\bpostgre(s|sql)\b/i,
  MySQL: /\bmysql\b/i,
  MongoDB: /\bmongo(db)?\b/i,
  SQL: /\bsql\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b(?!\s*script)/i,
  'C++': /\bc\+\+/i,
  C: /\bc\b(?![+#])/,
  HTML: /\bhtml5?\b/i,
  CSS: /\bcss3?\b/i,
  Tailwind: /\btailwind(\s*css)?\b/i,
  Bootstrap: /\bbootstrap\b/i,
  Redux: /\bredux\b/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b/i,
  AWS: /\baws\b|amazon web services/i,
  Git: /\bgit\b|\bgithub\b/i,
  Linux: /\blinux\b/i,
  Figma: /\bfigma\b/i,
  'UI/UX': /\bui\s*\/\s*ux\b|\bux\s+design/i,
  Django: /\bdjango\b/i,
  Flask: /\bflask\b/i,
  FastAPI: /\bfastapi\b/i,
  'Spring Boot': /\bspring\s*boot\b/i,
  Firebase: /\bfirebase\b/i,
  'Machine Learning': /\bmachine learning\b|\bml\b/i,
  TensorFlow: /\btensorflow\b/i,
  PyTorch: /\bpytorch\b/i,
  Pandas: /\bpandas\b/i,
  'Power BI': /\bpower\s*bi\b/i,
  Flutter: /\bflutter\b/i,
  Kotlin: /\bkotlin\b/i,
  'REST APIs': /\brest(ful)?\s*api/i,
  GraphQL: /\bgraphql\b/i,
};

const CITIES = ['Chennai', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Pune', 'Mumbai', 'Coimbatore', 'Madurai', 'Kallakurichi', 'Trichy', 'Delhi'];

export type ParsedResume = {
  text: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  headline?: string;
  skills: string[];
};

export async function pdfText(buf: Buffer | Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, ' ').trim();
}

/** Heuristic field extraction from resume text (no external service, nothing leaves the server). */
export function parseResumeText(text: string): ParsedResume {
  const email = text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase();
  const phone = text.match(/(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/)?.[0]?.replace(/\s+/g, ' ');
  const li = text.match(/linkedin\.com\/in\/[\w-]+/i)?.[0];
  const role = text.match(/\b(full[\s-]?stack|front[\s-]?end|back[\s-]?end|software|web|mlops|ml|data|ui\/ux|mobile|android)\s+(developer|engineer|analyst|designer)\b/i)?.[0];
  return {
    text,
    email,
    phone,
    linkedin: li ? `https://${li}` : undefined,
    location: CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(text))?.replace('Bangalore', 'Bengaluru'),
    headline: role ? role.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/[\s-]+/g, (m) => (m.includes('-') ? '-' : ' ')) : undefined,
    skills: Object.entries(SKILLS)
      .filter(([, re]) => re.test(text))
      .map(([name]) => name),
  };
}

export async function parseResume(buf: Buffer | Uint8Array): Promise<ParsedResume> {
  try {
    return parseResumeText(await pdfText(buf));
  } catch {
    return { text: '', skills: [] }; // scanned/corrupt PDF: no text layer
  }
}

/** "2117240020005 - Abimanue M.pdf" / "Afsa_R_Resume_.pdf" / "AbinaJerlinM.pdf" → readable name. */
export function nameFromFileName(file: string) {
  return file
    .replace(/\.pdf$/i, '')
    .replace(/resum[eé]/gi, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/[^\p{L}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
