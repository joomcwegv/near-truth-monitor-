package main

import (
	"encoding/json"

	"github.com/vlmoon99/near-sdk-go/collections"
	"github.com/vlmoon99/near-sdk-go/env"
	"github.com/vlmoon99/near-sdk-go/promise"
	"github.com/vlmoon99/near-sdk-go/types"
)

type RequestData struct {
	Prompt  string `json:"prompt"`
	YieldId []byte `json:"yield_id"`
}

// @contract:state
type YieldResumeContract struct {
	Requests  *collections.UnorderedMap[string, RequestData] `json:"requests"`
	RequestId uint64                                         `json:"request_id"`
}

// @contract:init
func (c *YieldResumeContract) Init() {
	c.Requests = collections.NewUnorderedMap[string, RequestData]("r")
	c.RequestId = 0
	env.LogString("YieldResumeContract initialized")
}

// @contract:mutating
func (c *YieldResumeContract) AskAssistant(prompt string) map[string]interface{} {
	requestId := c.RequestId
	c.RequestId++

	// Build arguments to pass to the callback when the promise resumes
	callbackArgs, _ := json.Marshal(map[string]uint64{"request_id": requestId})

	gas := env.GetPrepaidGas()
	callbackGas := gas.Inner / 3

	// Create a yielded promise — execution pauses here until resumed externally
	functionName := []byte("return_external_response")
	_ = env.PromiseYieldCreate(functionName, callbackArgs, callbackGas, 0)

	// Read the yield ID from the data register (register 0)
	yieldId, _ := env.ReadRegisterSafe(env.DataIdRegister)

	// Store the request so the external service can find it
	c.Requests.Insert(types.IntToString(int(requestId)), RequestData{
		Prompt:  prompt,
		YieldId: yieldId,
	})

	return map[string]interface{}{
		"request_id": requestId,
		"status":     "processing",
	}
}

type RespondInput struct {
	RequestId uint64 `json:"request_id"`
	Response  string `json:"response"`
}

// @contract:mutating
func (c *YieldResumeContract) Respond(input RespondInput) bool {
	key := types.IntToString(int(input.RequestId))

	requestData, err := c.Requests.Get(key)
	if err != nil {
		env.PanicStr("No pending request with that ID")
	}

	// Build the payload to pass to the resumed function
	payload, _ := json.Marshal(map[string]string{"response": input.Response})

	// Signal the yielded promise to resume with the external response
	result := env.PromiseYieldResume(requestData.YieldId, payload)
	return result == 1
}

type ResumeCallbackInput struct {
	RequestId uint64 `json:"request_id"`
}

type ResumePayload struct {
	Response string `json:"response"`
}

// @contract:mutating
// @contract:promise_callback
func (c *YieldResumeContract) ReturnExternalResponse(
	input ResumeCallbackInput,
	result promise.PromiseResult,
) map[string]interface{} {
	key := types.IntToString(int(input.RequestId))

	// Always clean up the request, even on timeout
	c.Requests.Remove(key)

	// result.Success is false if the contract timed out waiting (200 blocks)
	if !result.Success {
		return map[string]interface{}{
			"request_id": input.RequestId,
			"status":     "timeout",
			"message":    "The external service did not respond in time",
		}
	}

	// Decode the payload provided by Respond()
	var payload ResumePayload
	json.Unmarshal(result.Data, &payload)

	return map[string]interface{}{
		"request_id": input.RequestId,
		"status":     "complete",
		"response":   payload.Response,
	}
}

// @contract:view
func (c *YieldResumeContract) GetPendingRequests() map[string]string {
	result := map[string]string{}
	keys, err := c.Requests.Keys()
	if err != nil {
		return result
	}
	for _, key := range keys {
		data, err := c.Requests.Get(key)
		if err != nil {
			continue
		}
		result[key] = data.Prompt
	}
	return result
}
