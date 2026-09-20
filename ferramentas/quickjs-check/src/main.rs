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

/// O prelúdio, lido de onde ele mora: o executor em Rust.
///
/// Recortado do fonte e não copiado. Uma cópia é a segunda verdade que
/// discorda no dia em que só uma sobe — e a que discordasse aqui faria este
/// exercício provar um prelúdio que o produto não usa.
fn preludio() -> Result<String, String> {
    const FONTE: &str = include_str!("../../../../SEELE/apps/seele-app/src/executor.rs");
    const MARCA: &str = "const PRELUDIO: &str = r#\"";
    let inicio = FONTE
        .find(MARCA)
        .ok_or("`PRELUDIO` não foi encontrado em executor.rs")?;
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
            ctx.eval::<(), _>(r#"
                globalThis.dados = {};
                globalThis.mundo = { agora: () => 123 };
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

        let seele = rquickjs::Object::new(ctx.clone()).map_err(|e| format!("seele: {e}"))?;
        seele
            .set("postar", postar)
            .map_err(|e| format!("seele.postar: {e}"))?;
        ctx.globals()
            .set("seele", seele)
            .map_err(|e| format!("global seele: {e}"))?;

        // As capacidades da API que este pacote declara. O prelúdio as lê e as
        // apaga; um pacote de API 3 receberia uma lista menor, e `SeeleUI`
        // nasceria sem `superficies`.
        let manifesto: serde_json::Value =
            serde_json::from_str(include_str!("../../../mod.json"))
                .map_err(|e| format!("mod.json: {e}"))?;
        let api = manifesto
            .get("api")
            .and_then(serde_json::Value::as_u64)
            .ok_or("o manifesto não declara `api`")?;
        let capacidades = if api >= 4 {
            r#"["regiao","tema","cartoes","arquivo","superficies","contribuicoes","estilos","classes"]"#
        } else {
            r#"["regiao","tema","cartoes","arquivo"]"#
        };
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

        // O MOD pergunta o retrato assim que sobe. Respondê-lo é o que o faz
        // seguir — e seguir é o que exercita o desenho.
        let primeiro = lido.borrow().first().cloned().unwrap_or_default();
        let pedido: serde_json::Value =
            serde_json::from_str(&primeiro).map_err(|e| format!("primeira fala: {e}"))?;
        let numero = pedido
            .get("n")
            .and_then(serde_json::Value::as_u64)
            .ok_or("a primeira fala do MOD não tem número")?;
        if pedido.get("tipo").and_then(serde_json::Value::as_str) != Some("snapshot") {
            return Err(format!("o MOD começou por {primeiro}, e não por um retrato"));
        }

        let retrato = format!(
            r#"{{"tipo":"resposta","n":{numero},"ok":true,"valor":{{
                "me":1,"open_channel":1,"channels":[{{"id":1,"name":"geral"}}],
                "presentes":[{{"id":1,"nickname":"Alex"}},{{"id":2,"nickname":"Lia"}}]
            }}}}"#
        );
        ctx.globals()
            .set("__resposta", retrato)
            .map_err(|e| format!("resposta: {e}"))?;
        ctx.eval::<(), _>("aoResponder(__resposta)")
            .map_err(|e| format!("aoResponder: {e}: {:?}", ctx.catch()))?;

        // As microtarefas que a resposta soltou. No executor quem as escoa é o
        // laço dele; aqui é esta linha.
        while ctx.execute_pending_job() {}

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
    println!(
        "QuickJS 0.12.2 / 8 MiB: o cliente sobe no prelúdio real, sem DOM e sem \
         Node, e fala {} vez(es) — {tipos:?}.",
        falas.len()
    );
    Ok(())
}
