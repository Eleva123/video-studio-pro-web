# Eleva Studio

Editor em português do Brasil para preparar vídeos e imagens para painéis de LED. A prévia usa **Remotion Player** e a exportação usa FFmpeg WebAssembly no navegador.

## Usar localmente

Requisitos: Node.js 20 ou superior e npm.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Para gerar a versão de produção:

```sh
npm run build
npm run preview
```

O primeiro carregamento do motor de exportação precisa de internet para baixar FFmpeg 0.12.10 do unpkg. Os arquivos de mídia permanecem no navegador. Os formatos de painel salvos ficam no armazenamento local; mídias e edições ficam nesta sessão.

## Funcionalidades

- Importe vídeos, PNG, JPG, WebP ou BMP. Cada mídia se torna uma cena.
- Ajuste largura e altura em pixels; **esticar até as bordas** é o padrão. Há opções explícitas para bordas pretas ou corte.
- Configure 24, 25, 30 ou 60 FPS e edite a duração em segundos ou quadros inteiros.
- Distribua uma duração total igualmente entre as cenas. Quando não houver divisão exata, as primeiras cenas recebem um quadro extra.
- Confira a prévia por quadro, reorganize, duplique e remova cenas; desfaça ou refaça as últimas 30 edições.
- Corte o início e o fim de um vídeo. Mantenha a velocidade, segurando o último quadro quando necessário, ou ajuste a velocidade para caber na duração.
- Exporte o projeto inteiro ou apenas a cena selecionada em MP4 H.264, yuv420p, FPS constante, com áudio opcional.
- O arquivo só aparece para download após conferir codec, pixels, FPS, duração e quantidade de quadros com ffprobe.
- Cancele a exportação e reinicie o motor na próxima tentativa.

## Tempo para três imagens

A 30 FPS, um vídeo de 10 segundos tem **300 quadros**. Para três imagens com tempos iguais, use 100 quadros por cena: 3,333… segundos. O timecode de cada trecho é `00:00:03:10` (3 segundos e 10 quadros); não significa 3,10 segundos decimais.

## Validação

```sh
npm test
npm run test:wasm
npm run build
```

Para conferir exportações com mídia real, instale FFmpeg e ffprobe e execute:

```sh
npm run test:media
```

Esses testes verificam uma imagem com 300 quadros, preenchimento até as bordas, vídeo curto com último quadro estendido, mudanças de três cenas nos quadros 100 e 200, cortes e áudio.

`test:wasm` executa o core 0.12.10 usado no navegador por meio de uma interface de teste em Node.js. Confere o exportador completo, imagens, vídeo curto, concatenação, falhas e limpeza dos arquivos de trabalho. O core tem um erro conhecido no código de retorno do ffprobe ([issue #817](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/817)); o editor exige um relatório novo, com streams e metadados completos, e depois valida os dados do vídeo.

## Publicação na Vercel

Framework: Vite. Comando de build: `npm run build`. Pasta de saída: `dist`. `vercel.json` preserva os cabeçalhos COOP/COEP. Use um deployment de preview para testar antes de promover a produção.

## Limites atuais

- Máximo de 250 MB por mídia, 4096 pixels por dimensão, 10 minutos por cena e 30 minutos por projeto. O limite prático depende da memória e potência do computador.
- Cada etapa de conversão pode usar até cinco minutos de processamento; etapas que excederem esse tempo são interrompidas.
- GIF animado, SVG, transições, legendas e camadas de texto não estão incluídos nesta versão.
- A prévia e a exportação usam os cortes escolhidos; cortes em segundos que não coincidam com um quadro são quantizados pelos respectivos decodificadores. Para trabalho com precisão de um quadro, use cortes que sejam múltiplos de `1 / FPS` e confira o arquivo final.
- Validar o arquivo não elimina um atraso introduzido pelo player, playlist ou controlador do painel. O tempo de reprodução precisa ser conferido no equipamento, filmando desde antes da primeira cena até a próxima entrada.

## Correções em relação à versão anterior

A versão anterior aplicava escala proporcional com preenchimento preto; ela não esticava a mídia. Uma imagem configurada para dez segundos foi reproduzida no teste como vídeo de um quadro (0,04 s a 25 FPS), em yuv444p. Também não verificava o código de saída do FFmpeg. Esta versão faz a imagem repetir até completar os quadros, estende vídeos curtos, usa yuv420p e rejeita resultados incompatíveis com o projeto.
