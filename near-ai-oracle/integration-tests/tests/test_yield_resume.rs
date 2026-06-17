use serde_json::{json, Value};

/// Build the contract before running:
///   cd yield-resume && near-go build
/// Then run from integration-tests/:
///   cargo test

// near-sdk-go double-encodes all return values; use two-step deserialization on every view.

#[tokio::test]
async fn test_yield_resume_init() -> anyhow::Result<()> {
    let sandbox = near_workspaces::sandbox().await?;
    let wasm = std::fs::read("../main.wasm")?;
    let contract = sandbox.dev_deploy(&wasm).await?;

    contract.call("init").args_json(json!({})).transact().await?.into_result()?;

    let raw: String = contract.view("get_pending_requests").args_json(json!({})).await?.json()?;
    let pending: Value = serde_json::from_str(&raw)?;
    assert!(pending.as_object().map(|m| m.is_empty()).unwrap_or(true));
    Ok(())
}

#[tokio::test]
async fn test_ask_assistant_creates_request() -> anyhow::Result<()> {
    let sandbox = near_workspaces::sandbox().await?;
    let wasm = std::fs::read("../main.wasm")?;
    let contract = sandbox.dev_deploy(&wasm).await?;
    contract.call("init").args_json(json!({})).transact().await?.into_result()?;

    let caller = sandbox.dev_create_account().await?;

    // Submit ask_assistant in a background task — it blocks until the yield is resolved.
    let ask_handle = {
        let caller = caller.clone();
        let contract_id = contract.id().clone();
        tokio::task::spawn(async move {
            caller
                .call(&contract_id, "ask_assistant")
                .args_json(json!({ "prompt": "What is NEAR?" }))
                .gas(near_workspaces::types::Gas::from_tgas(100))
                .transact()
                .await
        })
    };

    // Wait for the ask_assistant receipt to be included (1 block ≈ 1 s in sandbox).
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // The request should now be in pending state (request_id = 0).
    let raw: String = contract.view("get_pending_requests").args_json(json!({})).await?.json()?;
    let pending: Value = serde_json::from_str(&raw)?;
    assert!(
        pending.as_object().map(|m| m.contains_key("0")).unwrap_or(false),
        "Request 0 should be in pending requests, got: {:?}", pending
    );

    // Resolve the yield by calling respond — this lets ask_assistant complete.
    let responder = sandbox.dev_create_account().await?;
    responder
        .call(contract.id(), "respond")
        .args_json(json!({ "request_id": 0u64, "response": "NEAR is a fast L1 blockchain!" }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Now ask_assistant's yield callback should fire, and transact() can return.
    ask_handle.await??.into_result()?;
    Ok(())
}

#[tokio::test]
async fn test_respond_to_invalid_request_fails() -> anyhow::Result<()> {
    let sandbox = near_workspaces::sandbox().await?;
    let wasm = std::fs::read("../main.wasm")?;
    let contract = sandbox.dev_deploy(&wasm).await?;
    contract.call("init").args_json(json!({})).transact().await?.into_result()?;

    let caller = sandbox.dev_create_account().await?;
    let result = caller
        .call(contract.id(), "respond")
        .args_json(json!({ "request_id": 999u64, "response": "Hello" }))
        .transact()
        .await?;

    assert!(!result.is_success(), "Responding to invalid request_id should fail");
    Ok(())
}

#[tokio::test]
async fn test_multiple_pending_requests() -> anyhow::Result<()> {
    let sandbox = near_workspaces::sandbox().await?;
    let wasm = std::fs::read("../main.wasm")?;
    let contract = sandbox.dev_deploy(&wasm).await?;
    contract.call("init").args_json(json!({})).transact().await?.into_result()?;

    let caller = sandbox.dev_create_account().await?;

    // Submit 3 ask_assistant calls in background, each waits for its own yield.
    let mut handles = Vec::new();
    for prompt in &["Q1", "Q2", "Q3"] {
        let caller = caller.clone();
        let contract_id = contract.id().clone();
        let prompt = prompt.to_string();
        handles.push(tokio::task::spawn(async move {
            caller
                .call(&contract_id, "ask_assistant")
                .args_json(json!({ "prompt": prompt }))
                .gas(near_workspaces::types::Gas::from_tgas(100))
                .transact()
                .await
        }));
        // Small delay so requests get sequential IDs reliably.
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // Wait for all 3 to be included in blocks.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let raw: String = contract.view("get_pending_requests").args_json(json!({})).await?.json()?;
    let pending: Value = serde_json::from_str(&raw)?;
    let count = pending.as_object().map(|m| m.len()).unwrap_or(0);
    assert_eq!(count, 3, "Expected 3 pending requests, got: {:?}", pending);

    // Resolve all yields so the background tasks can finish.
    let responder = sandbox.dev_create_account().await?;
    for id in 0u64..3 {
        responder
            .call(contract.id(), "respond")
            .args_json(json!({ "request_id": id, "response": format!("Answer {}", id) }))
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?
            .into_result()?;
    }

    for handle in handles {
        handle.await??.into_result()?;
    }
    Ok(())
}
