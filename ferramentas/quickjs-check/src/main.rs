use rquickjs::{Context, Runtime, Function, Object};
use std::{cell::RefCell, collections::HashMap, rc::Rc};

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
