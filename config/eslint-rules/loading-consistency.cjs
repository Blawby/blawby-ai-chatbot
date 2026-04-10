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

    function getNodeText(node) {
      if (!node) {
        return null;
      }

      if (node.type === 'JSXText') {
        return node.value;
      }

      if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
      }

      if (node.type === 'TemplateElement') {
        return node.value?.cooked ?? node.value?.raw ?? null;
      }

      if (node.type === 'TemplateLiteral') {
        return node.quasis
          .map((quasi) => quasi.value?.cooked ?? quasi.value?.raw ?? '')
          .join('');
      }

      return null;
    }

    function hasLoadingText(text) {
      return typeof text === 'string' && loadingTextPatterns.some(pattern => pattern.test(text));
    }

    function reportIfLoadingText(node, messageId) {
      const text = getNodeText(node);
      if (!hasLoadingText(text)) {
        return;
      }

      context.report({
        node,
        messageId,
      });
    }

    function isJsxChildExpression(node) {
      return Boolean(
        node.parent &&
        node.parent.type === 'JSXExpressionContainer' &&
        node.parent.parent &&
        node.parent.parent.type !== 'JSXAttribute'
      );
    }

    return {
      // Check JSX text content
      JSXText(node) {
        reportIfLoadingText(node, 'noVisibleLoadingText');
      },

      // Check string literals in JSX expressions (direct children only, not attribute values)
      JSXExpressionContainer(node) {
        // Skip attribute values — these are props like label="Loading…" which are for accessibility
        if (node.parent && node.parent.type === 'JSXAttribute') {
          return;
        }
        if (node.expression.type === 'Literal' || node.expression.type === 'TemplateLiteral') {
          reportIfLoadingText(node.expression, 'noVisibleLoadingText');
        }
      },

      Literal(node) {
        if (isJsxChildExpression(node)) {
          reportIfLoadingText(node, 'noVisibleLoadingText');
        }
      },

      TemplateLiteral(node) {
        if (isJsxChildExpression(node)) {
          reportIfLoadingText(node, 'noVisibleLoadingText');
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

        reportIfLoadingText(node.consequent, 'noLoadingTextInButton');
        reportIfLoadingText(node.alternate, 'noLoadingTextInButton');
      },

      // Check ternary operators in JSX
      JSXElement(node) {
        if (node.openingElement.name.name === 'Button') {
          // Check for loading text in button children
          node.children.forEach(child => {
            if (child.type === 'JSXExpressionContainer') {
              if (child.expression.type === 'ConditionalExpression') {
                const { consequent, alternate } = child.expression;

                reportIfLoadingText(consequent, 'noLoadingTextInButton');
                reportIfLoadingText(alternate, 'noLoadingTextInButton');
              }
            }
          });
        }
      },
    };
  },
};
