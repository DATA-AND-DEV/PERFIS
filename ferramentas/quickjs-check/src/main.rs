//! O MOD, no motor de verdade.
//!
//! # Por que dois exercícios e não um
//!
//! A metade de servidor sempre rodou aqui: ela é `aoPedir`, ela não tem
//! ambiente, e o `smoke.js` ao lado a percorre inteira.
//!
//! A metade de **cliente** nunca rodou. Ela era exercitada no `vm` do Node —
//! que tem o JavaScript moderno inteiro, como o QuickJS tem — e no laboratório
//! do navegador, que tem ainda mais. Nenhum dos dois prova o que este binário
//! prova: que o código que sai deste pacote sobe no mesmo motor, sob o mesmo
//! teto de memória, com o mesmo prelúdio, e sem as coisas que os outros dois
//! oferecem de graça.
//!
//! A auditoria de 20/09/2026 nomeia o risco que isso cobre ao falar do
//! laboratório: *«Corrigir o laboratório é parte da entrega da API, pois é o
//! que o criador de MOD usa para aprender e validar.»* Um laboratório mais
//! permissivo que o produto ensina a escrever o que o produto recusa.
//!
//! # O que este exercício **não** prova
//!
//! Não é o executor: não há supervisão, não há geração, não há fila com teto,
//! não há interrupção por tempo de volta nem descarte. O que há é o motor, o
//! limite de heap e o prelúdio. O resto é o produto, e a auditoria pede
//! observação nativa para dar qualquer fluxo por homologado.

use rquickjs::{Context, Function, Object, Runtime};
use std::{cell::RefCell, collections::HashMap, rc::Rc};

/// O prelúdio, lido de onde ele mora: o motor em Rust, desde 09/10/2026 um
/// texto só para o desktop e o celular.
///
/// Recortado do fonte e não copiado. Uma cópia é a segunda verdade que
/// discorda no dia em que só uma sobe — e a que discordasse aqui faria este
/// exercício provar um prelúdio que o produto não usa.
fn preludio() -> Result<String, String> {
    const FONTE: &str = include_str!(concat!(env!("SEELE_RAIZ"), "/crates/seele-motor/src/preludio.rs"));
    const MARCA: &str = "const PRELUDIO: &str = r#\"";
    let inicio = FONTE
        .find(MARCA)
        .ok_or("`PRELUDIO` não foi encontrado em preludio.rs")?;
    let resto = &FONTE[inicio + MARCA.len()..];
    let fim = resto.find("\"#;").ok_or("`PRELUDIO` não fecha")?;
    Ok(resto[..fim].to_owned())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    servidor()?;
    cliente()?;
    Ok(())
}

/// A metade de servidor: `aoPedir`, sem ambiente nenhum.
fn servidor() -> Result<(), Box<dyn std::error::Error>> {
    for (name, code) in [
        ("perfis", include_str!("../../../servidor/main.js")),
    ] {
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(8 * 1024 * 1024);
        let context = Context::full(&runtime)?;
        let result = context.with(|ctx| -> Result<String, String> {
            // O mundo e o volume do Servidor 1.0. O volume guarda só o tamanho
            // do que chegou: os bytes moram fora do motor, no disco de quem
            // hospeda, e o `smoke.js` faz o papel do produto que os transmite.
            ctx.eval::<(), _>(r#"
                globalThis.dados = {};
                globalThis.__avisos = [];
                globalThis.mundo = {
                    agora: () => 123,
                    avisar: aviso => (__avisos.push(JSON.stringify(aviso)), { ok: true }),
                };
                globalThis.__esperas = new Map();
                globalThis.__volume = new Map();
                globalThis.volume = {
                    esperar: (token, nome) => (__esperas.set(token, nome), true),
                    tamanho: nome => (__volume.has(nome) ? __volume.get(nome) : null),
                    servir: nome => (__volume.has(nome) ? nome : null),
                    apagar: nome => (__volume.delete(nome), true),
                };
            "#).map_err(|e| format!("bindings: {e}: {:?}", ctx.catch()))?;
            // Storage is outside the JS heap, like SEELE's real file bindings.
            let disk = Rc::new(RefCell::new(HashMap::<String,String>::new()));
            let files = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
            let read = disk.clone();
            files.set("ler", Function::new(ctx.clone(), move |p: String| read.borrow().get(&p).cloned()).unwrap()).unwrap();
            let write = disk.clone();
            files.set("escrever", Function::new(ctx.clone(), move |p: String,v: String| {
                if v.len()>4*1024*1024{return false;}
                write.borrow_mut().insert(p,v);true
            }).unwrap()).unwrap();
            files.set("apagar", Function::new(ctx.clone(), move |p: String| {disk.borrow_mut().remove(&p);true}).unwrap()).unwrap();
            ctx.globals().set("arquivos", files).map_err(|e| e.to_string())?;
            ctx.eval::<(), _>(code).map_err(|e| format!("load: {e}: {:?}", ctx.catch()))?;
            ctx.globals().set("kind", name).map_err(|e| e.to_string())?;
            ctx.eval::<String, _>(include_str!("../smoke.js"))
                .map_err(|e| format!("test: {e}: {:?}", ctx.catch()))
        });
        println!("{}: {}", name, result.map_err(std::io::Error::other)?);
    }
    Ok(())
}

/// A metade de cliente: o prelúdio do executor, e o pacote em cima dele.
///
/// O que o motor recebe é o que o executor entrega — `seele.postar` e nada
/// mais. Não há `document`, não há `window`, não há `fetch` e não há o `vm` do
/// Node por baixo. Se o pacote depender de qualquer um deles, é aqui que se
/// descobre.
fn cliente() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = Runtime::new()?;
    runtime.set_memory_limit(8 * 1024 * 1024);
    let started = std::time::Instant::now();
    runtime.set_interrupt_handler(Some(Box::new(move || started.elapsed().as_secs() > 5)));
    let context = Context::full(&runtime)?;

    // O que o MOD falou, na ordem em que ele falou. É por aqui que se sabe se
    // ele chegou a desenhar alguma coisa, ou se morreu antes.
    let fita: Rc<RefCell<Vec<String>>> = Rc::new(RefCell::new(Vec::new()));

    let resultado = context.with(|ctx| -> Result<String, String> {
        let eco = Rc::clone(&fita);
        let lido = Rc::clone(&fita);
        let postar = Function::new(ctx.clone(), move |texto: String| -> bool {
            // O mesmo teto de mensagem do executor. Um pacote que o estoure
            // descobre aqui, e não numa janela onde a volta some.
            if texto.len() > 12 * 1024 {
                return false;
            }
            eco.borrow_mut().push(texto);
            true
        })
        .map_err(|e| format!("postar: {e}"))?;

        // O registro de quem hospeda: o que o MOD disse como aviso ou erro
        // aparece na saída, para quem lê saber por que ele parou.
        let registro = Function::new(ctx.clone(), move |nivel: String, texto: String| {
            if nivel == "warn" || nivel == "error" {
                eprintln!("[MOD {nivel}] {texto}");
            }
        })
        .map_err(|e| format!("console: {e}"))?;

        let seele = rquickjs::Object::new(ctx.clone()).map_err(|e| format!("seele: {e}"))?;
        seele
            .set("postar", postar)
            .map_err(|e| format!("seele.postar: {e}"))?;
        seele
            .set("console", registro)
            .map_err(|e| format!("seele.console: {e}"))?;
        ctx.globals()
            .set("seele", seele)
            .map_err(|e| format!("global seele: {e}"))?;

        // As capacidades da API que este pacote declara, **do contrato do
        // SEELE** (`api/v7.json`, que traz a 6 inteira), e não de uma lista escrita aqui: a lista
        // escrita foi a que ficou na 5 quando o produto passou à 6. O prelúdio
        // as lê e as apaga.
        let manifesto: serde_json::Value =
            serde_json::from_str(include_str!("../../../mod.json"))
                .map_err(|e| format!("mod.json: {e}"))?;
        let api = manifesto
            .get("api")
            .and_then(serde_json::Value::as_u64)
            .ok_or("o manifesto não declara `api`")?;
        let contrato: serde_json::Value =
            serde_json::from_str(include_str!(concat!(env!("SEELE_RAIZ"), "/api/v7.json")))
                .map_err(|e| format!("api/v7.json: {e}"))?;
        let capacidades = contrato
            .pointer(&format!("/compatibilidade/capacidades-por-versao/{api}"))
            .filter(|lista| lista.is_array())
            .ok_or(format!("o api/v7.json deste SEELE não dá capacidades à API {api}"))?;
        ctx.eval::<(), _>(format!("globalThis.__seeleCapacidades = {capacidades};"))
            .map_err(|e| format!("capacidades: {e}: {:?}", ctx.catch()))?;

        ctx.eval::<(), _>(preludio()?)
            .map_err(|e| format!("prelúdio: {e}: {:?}", ctx.catch()))?;

        // **A prova do ambiente, antes do pacote.** Se o prelúdio deixasse
        // passar qualquer coisa de navegador ou de Node, um MOD poderia
        // depender dela sem nada reclamar — e a fronteira seria uma promessa
        // escrita em vez de uma medida.
        let vazios: String = ctx
            .eval(
                r#"['document','window','fetch','XMLHttpRequest','WebSocket','localStorage',
                    'require','process','importScripts','Worker']
                   .filter(n => typeof globalThis[n] !== 'undefined').join(',')"#,
            )
            .map_err(|e| format!("ambiente: {e}: {:?}", ctx.catch()))?;
        if !vazios.is_empty() {
            return Err(format!(
                "o contexto do MOD tem coisas que ele não deveria ter: {vazios}"
            ));
        }

        ctx.eval::<(), _>(include_str!("../../../cliente/main.js"))
            .map_err(|e| format!("cliente: {e}: {:?}", ctx.catch()))?;

        // **A conversa, até o MOD parar de falar.** O primeiro pedido tem de
        // ser o retrato da 6 — o `snapshot` não existe nela —, e cada fala
        // recebe a resposta que o anfitrião daria: o retrato pela lista
        // branca, a consulta do servidor, e o handle de cada contribuição.
        // Responder só à primeira provava que o MOD subia; responder a todas
        // prova que ele chega a apresentar alguém.
        let primeiro = lido.borrow().first().cloned().unwrap_or_default();
        let pedido: serde_json::Value =
            serde_json::from_str(&primeiro).map_err(|e| format!("primeira fala: {e}"))?;
        if pedido.get("tipo").and_then(serde_json::Value::as_str) != Some("retrato") {
            return Err(format!("o MOD começou por {primeiro}, e não pelo retrato"));
        }
        let mut respondidas = 0;
        let mut handles = 0;
        for _volta in 0..256 {
            let novas: Vec<String> = lido.borrow()[respondidas..].to_vec();
            if novas.is_empty() {
                break;
            }
            respondidas += novas.len();
            for texto in novas {
                let fala: serde_json::Value =
                    serde_json::from_str(&texto).map_err(|e| format!("fala: {e}"))?;
                let Some(numero) = fala.get("n").and_then(serde_json::Value::as_u64) else {
                    continue;
                };
                let valor = match fala.get("tipo").and_then(serde_json::Value::as_str) {
                    Some("retrato") => serde_json::json!({
                        "eu": 1, "servidor": { "nome": "laboratório" },
                        "pessoas": [
                            { "id": 1, "apelido": "Alex", "falando": false, "mudo": false },
                            { "id": 2, "apelido": "Lia", "falando": false, "mudo": false },
                        ],
                        "salas": [], "canais": [{ "id": 1, "nome": "geral", "aberto": true }],
                        "onde": "computador", "regioes": ["servidor.navegacao", "pessoas.lista", "pagina", "dialogo", "folha", "aviso"],
                    }),
                    Some("pedido") => serde_json::json!({
                        "ok": true, "me": "1",
                        "profiles": {
                            "1": { "revision": 1, "displayName": "Alex", "pronouns": "", "bio": "", "status": "aqui",
                                   "accent": "#f2521f", "effect": "aurora", "avatar": null, "banner": null },
                            "2": { "revision": 1, "displayName": "Lia", "pronouns": "ela/dela", "bio": "", "status": "",
                                   "accent": "#a78bfa", "effect": "none", "avatar": null, "banner": null },
                        },
                    }),
                    Some("contribuir") => {
                        handles += 1;
                        serde_json::json!({ "handle": format!("c{handles}"), "recusados": 0 })
                    }
                    Some("atualizar-contribuicao") | Some("revogar-contribuicao") => serde_json::json!(true),
                    _ => serde_json::Value::Null,
                };
                let resposta = serde_json::json!({ "tipo": "resposta", "n": numero, "ok": true, "valor": valor });
                ctx.globals()
                    .set("__resposta", resposta.to_string())
                    .map_err(|e| format!("resposta: {e}"))?;
                ctx.eval::<(), _>("aoResponder(__resposta)")
                    .map_err(|e| format!("aoResponder: {e}: {:?}", ctx.catch()))?;
                // As microtarefas que a resposta soltou. No executor quem as
                // escoa é o laço dele; aqui é esta linha.
                while ctx.execute_pending_job() {}
            }
        }

        Ok(String::new())
    });
    resultado.map_err(std::io::Error::other)?;

    // O que ele falou depois do retrato. Um MOD que só perguntou e parou não
    // chegou a desenhar, e isso é uma falha silenciosa — a mais cara deste
    // repositório.
    let falas = fita.borrow();
    let tipos: Vec<String> = falas
        .iter()
        .filter_map(|texto| {
            serde_json::from_str::<serde_json::Value>(texto)
                .ok()?
                .get("tipo")?
                .as_str()
                .map(str::to_owned)
        })
        .collect();
    if !tipos.iter().any(|t| t == "pedido") {
        return Err(format!(
            "o MOD não chegou a falar com o servidor dele: {tipos:?}"
        )
        .into());
    }
    if tipos.iter().any(|t| t == "snapshot" || t == "regiao" || t == "cartoes") {
        return Err(format!("o MOD pediu o que a API 6 não tem: {tipos:?}").into());
    }
    // O cartão de cada pessoa e a entrada, cada um pelo ponto dele.
    let pontos: Vec<String> = falas
        .iter()
        .filter_map(|texto| {
            let fala: serde_json::Value = serde_json::from_str(texto).ok()?;
            if fala.get("tipo")?.as_str()? != "contribuir" {
                return None;
            }
            fala.pointer("/pedido/ponto")?.as_str().map(str::to_owned)
        })
        .collect();
    for ponto in ["pessoa.cartao", "servidor.navegacao"] {
        if !pontos.iter().any(|p| p == ponto) {
            return Err(format!("o MOD não contribuiu para «{ponto}»: {pontos:?}").into());
        }
    }
    println!(
        "QuickJS 0.12.2 / 8 MiB: o cliente sobe no prelúdio real, sem DOM e sem \
         Node, e fala {} vez(es); contribui para {pontos:?}.",
        falas.len()
    );
    Ok(())
}
