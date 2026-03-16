module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: ['./tsconfig.json']
    },
    env: {
        node: true,
        es2022: true
    },
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    ignorePatterns: ['dist', 'node_modules'],
    rules: {
        '@typescript-eslint/consistent-type-imports': 'error'
    }
};
