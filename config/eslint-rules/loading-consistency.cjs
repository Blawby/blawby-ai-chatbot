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
      /\bloading\b/i,
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
          // Handled by JSXExpressionContainer to avoid double-reporting
          return;
        }
      },

      TemplateLiteral(node) {
        if (isJsxChildExpression(node)) {
          // Handled by JSXExpressionContainer to avoid double-reporting
          return;
        }
      },

      // Check button text changes — only when the JSX ancestor is a Button element
      ConditionalExpression(node) {
        const parent = node.parent;
        if (!parent || parent.type !== 'JSXExpressionContainer') {
          return;
        }
        const grandParent = parent.parent;
        if (!grandParent || grandParent.type === 'JSXAttribute') {
          return;
        }
        // Walk up to the nearest JSXElement and check if it's a Button
        let ancestor = grandParent;
        while (ancestor && ancestor.type !== 'JSXElement') {
          ancestor = ancestor.parent;
        }
        if (!ancestor || ancestor.type !== 'JSXElement') return;
        const openingName = ancestor.openingElement && ancestor.openingElement.name;
        const isButton =
          (openingName && openingName.type === 'JSXIdentifier' && openingName.name === 'Button') ||
          (openingName && openingName.type === 'JSXMemberExpression' &&
            openingName.property && openingName.property.name === 'Button');
        if (!isButton) return;

        reportIfLoadingText(node.consequent, 'noLoadingTextInButton');
        reportIfLoadingText(node.alternate, 'noLoadingTextInButton');
      },
    };
  },
};
