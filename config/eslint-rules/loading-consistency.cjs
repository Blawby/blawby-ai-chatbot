module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent visible loading text in favor of shared loading primitives',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noVisibleLoadingText: 'Visible loading text is not allowed. Use LoadingSpinner, LoadingBlock, LoadingScreen, or SkeletonLoader instead.',
      noLoadingTextInButton: 'Button text should not change to "Loading...". Keep original label and prepend LoadingSpinner.',
      noHardcodedLoadingText: 'Hard-coded loading text is not allowed. Use shared loading primitives with accessible labels.',
    },
  },

  create(context) {
    const loadingTextPatterns = [
      /Loading\.\.\./,
      /Loading…/,
      /Calculating/,
      /Processing/,
      /Sending/,
      /Uploading/,
      /loading/i,
    ];

    function checkNode(node, messageId) {
      if (node.type === 'Literal' || node.type === 'TemplateElement') {
        const text = node.value;
        if (typeof text === 'string' && loadingTextPatterns.some(pattern => pattern.test(text))) {
          context.report({
            node,
            messageId,
          });
        }
      }
    }

    return {
      // Check JSX text content
      JSXText(node) {
        checkNode(node, 'noVisibleLoadingText');
      },

      // Check string literals in JSX expressions (direct children only, not attribute values)
      JSXExpressionContainer(node) {
        // Skip attribute values — these are props like label="Loading…" which are for accessibility
        if (node.parent && node.parent.type === 'JSXAttribute') {
          return;
        }
        if (node.expression.type === 'Literal' || node.expression.type === 'TemplateLiteral') {
          checkNode(node.expression, 'noVisibleLoadingText');
        }
      },

      // Check button text changes (only in JSX element children, not attribute values)
      ConditionalExpression(node) {
        // Only check when this conditional is inside a JSXExpressionContainer
        // that is a child of a JSXElement (not an attribute value)
        const parent = node.parent;
        if (!parent || parent.type !== 'JSXExpressionContainer') {
          return;
        }
        const grandParent = parent.parent;
        if (!grandParent || grandParent.type === 'JSXAttribute') {
          return;
        }

        if (node.consequent.type === 'Literal' && node.alternate.type === 'Literal') {
          const consequentText = node.consequent.value;
          const alternateText = node.alternate.value;

          if (typeof consequentText === 'string' && loadingTextPatterns.some(pattern => pattern.test(consequentText))) {
            context.report({
              node: node.consequent,
              messageId: 'noLoadingTextInButton',
            });
          }

          if (typeof alternateText === 'string' && loadingTextPatterns.some(pattern => pattern.test(alternateText))) {
            context.report({
              node: node.alternate,
              messageId: 'noLoadingTextInButton',
            });
          }
        }
      },

      // Check ternary operators in JSX
      JSXElement(node) {
        if (node.openingElement.name.name === 'Button') {
          // Check for loading text in button children
          node.children.forEach(child => {
            if (child.type === 'JSXExpressionContainer') {
              if (child.expression.type === 'ConditionalExpression') {
                const { consequent, alternate } = child.expression;

                if (consequent.type === 'Literal' && loadingTextPatterns.some(pattern => pattern.test(consequent.value))) {
                  context.report({
                    node: consequent,
                    messageId: 'noLoadingTextInButton',
                  });
                }

                if (alternate.type === 'Literal' && loadingTextPatterns.some(pattern => pattern.test(alternate.value))) {
                  context.report({
                    node: alternate,
                    messageId: 'noLoadingTextInButton',
                  });
                }
              }
            }
          });
        }
      },
    };
  },
};
