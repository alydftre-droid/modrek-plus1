# Modrek Plus — Design System (DS)

نظام تصميم رسمي وموحد للمنصة. **لا يعدّل أي صفحة حالية**. يُستخدم فقط للصفحات والميزات الجديدة.

## طريقة الاستخدام

```tsx
import { DSButton, DSCard, DSInput, DSBadge } from "@/design-system";

<DSCard>
  <DSInput label="الاسم" placeholder="اكتب هنا" />
  <DSButton variant="primary" size="md">حفظ</DSButton>
</DSCard>
```

## القاعدة الذهبية
- الصفحات القديمة تبقى كما هي 100%.
- أي صفحة/ميزة جديدة **يجب** أن تستخدم مكونات `@/design-system` فقط.
- ممنوع Glassmorphism / Blur / Pastel / Gradients غير معتمدة.
- الخط: **Cairo** فقط. الأيقونات: **lucide-react** فقط.

## الملفات
- `tokens.ts` — Design Tokens (ألوان، مسافات، ظلال، خطوط).
- `tokens.css` — متغيرات CSS معزولة تحت `[data-ds-scope]`.
- `components/*` — مكونات موحدة (Button, Card, Input, Table, Tabs, Alert...).
- `index.ts` — نقطة تصدير واحدة.

## اللوحة اللونية الرسمية
| Token | Value |
|---|---|
| Primary | `#2563EB` |
| Primary Hover | `#1D4ED8` |
| Purple | `#7C3AED` |
| Emerald / Success | `#059669` |
| Orange | `#EA580C` |
| Red / Error | `#DC2626` |
| Gray | `#334155` |
| Background | `#F8FAFC` |
| Card | `#FFFFFF` |
| Border | `#E2E8F0` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Info | `#2563EB` |
