# Roadmap de Cibersegurança

Roadmap interativo e pessoal de estudos em cibersegurança — cursos, certificações e práticas organizados por nicho, com filtro de preço e sequência de pré-requisitos.

🔗 **Demo:** [em breve — deploy Vercel]

---

## Motivação

Comecei esse projeto como estagiário na AGEVISA, buscando um caminho de estudo estruturado e gratuito antes de investir em certificações pagas. Existem roadmaps prontos (como o [roadmap.sh](https://roadmap.sh/cyber-security)), mas queria algo com:

- **Preço em contexto real** (gratuito vs. pago), pensado pra quem também tem orçamento apertado
- **Sequência de pré-requisitos** entre itens (o que preciso saber antes de avançar)
- **Curadoria própria**, com links verificados manualmente — não é lista genérica

Mais do que uma ferramenta de estudo, esse projeto também é meu primeiro contato prático com estruturação de dados, git/GitHub, e deploy de um site estático do zero.

---

## Funcionalidades

- [x] Base de dados em JSON, separando **nichos** (categorias) de **itens** (cursos/certificações)
- [x] Preços verificados e atualizados (USD, jul/2026)
- [x] Campo de pré-requisito entre itens (ex: Security+ requer Network+)
- [ ] Filtro por preço (gratuito / pago)
- [ ] Filtro por tipo (curso, certificação, prática, ferramenta, leitura)
- [ ] Interface visual (Figma → HTML/CSS/JS)
- [ ] Progresso salvo (marcar item como concluído)
- [ ] Deploy no Vercel

---

## Stack

- HTML / CSS / JavaScript puro (sem framework)
- Dados em JSON estático
- Deploy: Vercel

---

## Estrutura de dados

O arquivo `colecao-ciberseguranca.json` separa dados em dois arrays, ligados por `nicheId`:

```json
{
  "niches": [
    { "id": "ofensiva", "nome": "Segurança Ofensiva (Red Team/Pentest)", "descricao": "..." }
  ],
  "items": [
    {
      "id": "pentestplus",
      "nicheId": "ofensiva",
      "nome": "CompTIA PenTest+",
      "tipo": "certificação",
      "gratuito": false,
      "preco_usd": 439,
      "url": "https://www.comptia.org/en-us/certifications/pentest/",
      "nivel": "intermediário",
      "requisito": "securityplus"
    }
  ]
}
```

Essa separação permite adicionar novos nichos ou itens sem tocar no HTML/JS, só atualizar no json.

---

## Nichos cobertos

Fundamentos, Segurança Ofensiva, Segurança Defensiva, GRC, Cloud Security, AppSec, Arquitetura de Segurança, Forense Digital, Resposta a Incidentes, Criptografia, IAM, DevSecOps, OSINT e Análise de Malware

---

## Como rodar localmente

```bash
git clone https://github.com/Dinorroxin/roadmap-ciberseguranca.git
cd roadmap-ciberseguranca
# abrir index.html no navegador, ou usar um live server
```

---

## Status

Projeto em desenvolvimento ativo — próximos passos: layout no Figma, implementação dos filtros e deploy.

---

## Autor

Felipe Siqueira Ramos Galvez (https://github.com/Dinorroxin) — estudante de Sistemas de Informação, estagiário da AGEVISA
