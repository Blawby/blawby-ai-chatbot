/**
 * Forbid inline object/array literals as React Context Provider `value` props.
 *
 *   // ❌ Wrong — fresh object every render forces all consumers to re-render.
 *   <FooContext.Provider value={{ a, b }}>{children}</FooContext.Provider>
 *
 *   // ✅ Right — memoize so identity is stable across renders.
 *   const value = useMemo(() => ({ a, b }), [a, b]);
 *   <FooContext.Provider value={value}>{children}</FooContext.Provider>
 *
 * The cost of an inline literal is invisible until your component re-renders
 * for an unrelated reason (e.g. parent state change) and every consumer of
 * the context re-runs even though the underlying data didn't change.
 *
 * This rule catches the pattern at PR time so the perf regression doesn't
 * land. It only fires on `*.Provider` JSX members; non-context Providers
 * (workbox, etc.) won't trip it.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow inline object/array literals as Context Provider values; use useMemo or a stable ref',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      inlineObject:
        'Inline object literal as Provider value triggers a fresh re-render of every consumer on each parent render. Wrap in useMemo or hoist the reference.',
      inlineArray:
        'Inline array literal as Provider value triggers a fresh re-render of every consumer on each parent render. Wrap in useMemo or hoist the reference.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name;
        // Match `Foo.Provider` (JSXMemberExpression) where the property is `Provider`.
        if (
          !name ||
          name.type !== 'JSXMemberExpression' ||
          !name.property ||
          name.property.name !== 'Provider'
        ) {
          return;
        }
        for (const attr of node.attributes) {
          if (
            attr.type !== 'JSXAttribute' ||
            !attr.name ||
            attr.name.name !== 'value' ||
            !attr.value ||
            attr.value.type !== 'JSXExpressionContainer'
          ) {
            continue;
          }
          const expr = attr.value.expression;
          if (expr.type === 'ObjectExpression') {
            context.report({ node: expr, messageId: 'inlineObject' });
          } else if (expr.type === 'ArrayExpression') {
            context.report({ node: expr, messageId: 'inlineArray' });
          }
        }
      },
    };
  },
};
