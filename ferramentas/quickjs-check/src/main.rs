use rquickjs::{Context, Runtime};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for (name, code) in [
        ("perfis", include_str!("../../../servidor/main.js")),
    ] {
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(8 * 1024 * 1024);
        let context = Context::full(&runtime)?;
        let result = context.with(|ctx| -> Result<String, String> {
            ctx.eval::<(), _>(r#"
                globalThis.dados = {};
                const disk = {};
                globalThis.mundo = { agora: () => 123 };
                globalThis.arquivos = {
                    ler: p => disk[p] ?? null,
                    escrever: (p,v) => { disk[p]=v; return true; },
                    apagar: p => { delete disk[p]; return true; }
                };
            "#).map_err(|e| format!("bindings: {e}: {:?}", ctx.catch()))?;
            ctx.eval::<(), _>(code).map_err(|e| format!("load: {e}: {:?}", ctx.catch()))?;
            ctx.globals().set("kind", name).map_err(|e| e.to_string())?;
            ctx.eval::<String, _>(include_str!("../smoke.js"))
                .map_err(|e| format!("test: {e}: {:?}", ctx.catch()))
        });
        println!("{}: {}", name, result.map_err(std::io::Error::other)?);
    }
    Ok(())
}
