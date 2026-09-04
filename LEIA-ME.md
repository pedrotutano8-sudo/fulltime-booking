# Gerador do AÇÃO NO TRADE

Serviço que monta o relatório mensal da Mann Filter em .pptx, reproduzindo o
gabarito medido na edição de Abril 2026.

## Subir na VPS

Copie esta pasta para `/opt/fulltime/gerador/` e acrescente ao
`docker-compose.yml` do projeto:

```yaml
  gerador:
    build: ./gerador
    container_name: fulltime_gerador
    restart: unless-stopped
    networks: [fulltime_default]
    ports:
      - "127.0.0.1:8090:8090"
    environment:
      SUPABASE_URL:          ${SUPABASE_URL}
      SUPABASE_SECRET_KEY:   ${SUPABASE_SECRET_KEY}
      R2_ACCOUNT_ID:         ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID:      ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY:  ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET:             ${R2_BUCKET}
      RESPONSAVEL:           Luciana
```

Depois `docker compose up -d --build gerador`.

Nada de novo no `.env` — reaproveita as variáveis que já existem.

## Expor

Um `server` novo no nginx, para `gerador.eduardolessa.online`, com
`proxy_pass http://127.0.0.1:8090`, `client_max_body_size 5M` e
`proxy_read_timeout 600s` — um relatório com 150 fotos leva alguns minutos.

## Uso

```
POST /gerar
Authorization: Bearer <JWT do Supabase>
{ "mes": "2026-04-01" }
```

Devolve o .pptx. Erros: 401 sem JWT válido, 403 sem perfil ativo,
404 se nenhuma foto foi aprovada no período.

`GET /saude` responde `{ok:true}` para o healthcheck.

## Como o slide é montado

- Um slide por promotor com foto aprovada, em ordem alfabética de nome
- Duas seções fixas: Campanhas Alcançadas e Conquistas
- A frase de cada seção vem de `relatorio_descricoes`
- Fotos com altura uniforme e largura proporcional ao formato original;
  se a linha estoura a largura útil, a altura encolhe e, no limite, quebra
  em duas linhas
- Tarja verde com o nome curto do PDV, com a fonte encolhendo para caber
- Carimbo de data, endereço e coordenada desenhado na imagem na montagem,
  a partir do dado do banco
- Rodapé amarelo com paginação automática

## Ativos

`ativos/capa_base.png` é a capa original da Mann, com o bloco de
responsável e mês apagado — esse texto é escrito por cima na geração.
`ativos/logo.png` é o logo do rodapé. Ambos extraídos do relatório de abril.

## Memória

As fotos são baixadas e processadas em série, uma por vez. Em paralelo,
150 originais estouram o container e o limite de conexões do R2.
Pico observado: ~250 MB.
