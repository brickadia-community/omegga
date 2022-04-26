use omegga::{events::Event, Omegga};

#[tokio::main]
async fn main() {
    let omegga = Omegga::new();
    let mut events = omegga.spawn();

    // Write your plugin!
    while let Some(event) = events.recv().await {
        match event {
            // Handle init/stop...
            Event::Init { id, .. } => omegga.register_commands(id, &["test"]),
            Event::Stop { id, .. } => omegga.write_response(id, None, None),

            // Listen for any commands we care about...
            Event::Command {
                player, command, ..
            } => match command.as_str() {
                "test" => omegga.broadcast(format!("Hello, {player}!")),
                _ => (),
            },
            _ => (),
        }
    }
}
