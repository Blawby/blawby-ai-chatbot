'use strict';

const FIXED_CLASS_RE = /\bfixed\b/;

const extractClassName = (value) => {
  if (!value) return null;
  if (value.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (value.type === 'JSXExpressionContainer') {
    const expr = value.expression;
    if (expr && expr.type === 'Literal' && typeof expr.value === 'string') {
      return expr.value;
    }
    if (expr && expr.type === 'TemplateLiteral') {
      return expr.quasis.map((q) => q.value.cooked).join(' ');
    }
  }
  return null;
};

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Widget interior must portal overlays via WidgetOverlayRoot. `position: fixed` is trapped by ancestor overflow/transform and clips overlays.',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      noFixedInWidget:
        'Widget interior cannot use `position: fixed` — overlays portal via WidgetOverlayRoot (see src/shared/ui/overlays/Drawer.tsx for the pattern). Ancestor overflow-hidden / transform traps fixed positioning and clips overlays.',
    },
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== 'className') return;
        const raw = extractClassName(node.value);
        if (!raw) return;
        if (FIXED_CLASS_RE.test(raw)) {
          context.report({ node: node.value, messageId: 'noFixedInWidget' });
        }
      },
    };
  },
};
