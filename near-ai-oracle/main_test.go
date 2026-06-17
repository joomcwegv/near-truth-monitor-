package main

import (
	"testing"

	"github.com/vlmoon99/near-sdk-go/env"
	"github.com/vlmoon99/near-sdk-go/promise"
	"github.com/vlmoon99/near-sdk-go/system"
)

func init() {
	env.SetEnv(system.NewMockSystem())
}

func setupTest(t *testing.T) *YieldResumeContract {
	t.Helper()
	ms := env.NearBlockchainImports.(*system.MockSystem)
	ms.Storage = make(map[string][]byte)
	c := &YieldResumeContract{}
	c.Init()
	return c
}

func TestAskAssistant_StoresRequest(t *testing.T) {
	c := setupTest(t)

	result := c.AskAssistant("What is 2+2?")

	if result["request_id"] != uint64(0) {
		t.Errorf("Expected request_id 0, got %v", result["request_id"])
	}
	if result["status"] != "processing" {
		t.Errorf("Expected status processing, got %v", result["status"])
	}
	if c.RequestId != 1 {
		t.Errorf("Expected RequestId 1, got %d", c.RequestId)
	}
}

func TestAskAssistant_IncrementRequestId(t *testing.T) {
	c := setupTest(t)

	c.AskAssistant("Question 1")
	c.AskAssistant("Question 2")
	c.AskAssistant("Question 3")

	if c.RequestId != 3 {
		t.Errorf("Expected RequestId 3, got %d", c.RequestId)
	}
}

func TestGetPendingRequests_ReturnsStoredPrompts(t *testing.T) {
	c := setupTest(t)

	c.AskAssistant("First question")
	c.AskAssistant("Second question")

	pending := c.GetPendingRequests()
	if len(pending) != 2 {
		t.Errorf("Expected 2 pending requests, got %d", len(pending))
	}
}

func TestReturnExternalResponse_Timeout(t *testing.T) {
	c := setupTest(t)

	c.AskAssistant("Will time out")

	// Simulate timeout: result.Success = false
	result := c.ReturnExternalResponse(
		ResumeCallbackInput{RequestId: 0},
		promise.PromiseResult{Success: false},
	)

	if result["status"] != "timeout" {
		t.Errorf("Expected timeout status, got %v", result["status"])
	}

	// Request should be removed from state
	pending := c.GetPendingRequests()
	if len(pending) != 0 {
		t.Errorf("Expected 0 pending requests after timeout, got %d", len(pending))
	}
}

func TestReturnExternalResponse_Success(t *testing.T) {
	c := setupTest(t)

	c.AskAssistant("What is NEAR?")

	responseJSON := []byte(`{"response":"NEAR is a blockchain platform"}`)
	result := c.ReturnExternalResponse(
		ResumeCallbackInput{RequestId: 0},
		promise.PromiseResult{
			Success:    true,
			Data:       responseJSON,
			StatusCode: 1,
		},
	)

	if result["status"] != "complete" {
		t.Errorf("Expected complete status, got %v", result["status"])
	}
	if result["response"] != "NEAR is a blockchain platform" {
		t.Errorf("Unexpected response: %v", result["response"])
	}

	// Request should be removed from state
	pending := c.GetPendingRequests()
	if len(pending) != 0 {
		t.Errorf("Expected 0 pending after response, got %d", len(pending))
	}
}

func TestReturnExternalResponse_CleansUpCorrectRequest(t *testing.T) {
	c := setupTest(t)

	c.AskAssistant("Q1")
	c.AskAssistant("Q2")

	// Resolve request 0, leave request 1 pending
	c.ReturnExternalResponse(
		ResumeCallbackInput{RequestId: 0},
		promise.PromiseResult{Success: false},
	)

	pending := c.GetPendingRequests()
	if len(pending) != 1 {
		t.Errorf("Expected 1 pending request remaining, got %d", len(pending))
	}
}
