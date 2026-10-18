# Critérios de qualidade da prévia

- Não alterar regras, dados ou serviços do backend para sustentar a demonstração.
- Não chamar autenticação, alterar senhas nem usar dados privados reais.
- Dinheiro em decimal canônico string e centavos BigInt; não usar Number/parseFloat em cálculos financeiros.
- Não reduzir o saldo de caixa ao empenhar ou liquidar; validar os limites de cada etapa e a cronologia.
- Autorização verificada no estado demonstrativo, além de ocultar controles. A demonstração não substitui segurança no servidor.
- TypeScript e templates estritos; sem any, supressões de tipo, testes desabilitados ou limites de build enfraquecidos para esconder falhas.
- Não estilizar classes internas privadas do Material. Preferir mat.theme, tokens e APIs de override documentadas.
- Idioma pt-BR, data estrita, números tabulares, rótulos explícitos, teclado e foco visível.
- Testes relevantes e build devem passar; relatar limitações reais da revisão e compatibilidade.
