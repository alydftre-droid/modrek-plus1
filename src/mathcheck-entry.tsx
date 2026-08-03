import { createRoot } from "react-dom/client";
import { RichMarkdown } from "./features/modrek-ai/RichMarkdown";
import "./index.css";
const sample = `# قانون فيثاغورس
📐 القانون: $$a^2 + b^2 = c^2$$
🧠 مثال: احسب $\\ja 30 = \\dfrac{1}{2}$ و $\\sqrt[3]{27}=3$
تفاعل: CaCO3 --> CaO + CO2 وحمض H2SO4
\\( \\sum_{n=1}^{\\infty} \\dfrac{1}{n^2} \\)
\`\`\`mermaid
graph TD; A[المعطيات]-->B[القانون]-->C[الحل];
\`\`\`
\`\`\`svg
<svg viewBox="0 0 200 120"><polygon points="10,110 190,110 10,10" fill="none" stroke="#2563EB" stroke-width="3"/></svg>
\`\`\`
✅ ملخص سريع: تم.`;
createRoot(document.getElementById("root")!).render(<RichMarkdown>{sample}</RichMarkdown>);
