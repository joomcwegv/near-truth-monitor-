package main

import (
	"math/big"

	"github.com/vlmoon99/near-sdk-go/env"
	"github.com/vlmoon99/near-sdk-go/types"
)

// Report — corruption report structure
type Report struct {
	Author     string `json:"author"`
	SchoolName string `json:"school_name"`
	Category   string `json:"category"`
	Text       string `json:"text"`
	Tips       string `json:"tips"` // yoctoNEAR as string
}

// @contract:state
type Contract struct {
	Reports  []Report `json:"reports"`
	Treasury string   `json:"treasury"` // yoctoNEAR as string
	OwnerID  string   `json:"owner_id"`
}

// @contract:init
func (c *Contract) Init(owner string) {
	c.Reports = []Report{}
	c.Treasury = "0"
	c.OwnerID = owner
	env.LogString("Truth Protocol contract initialized!")
}

// @contract:mutating
func (c *Contract) AddReport(schoolName string, category string, text string) {
	sender, err := env.GetPredecessorAccountID()
	if err != nil {
		env.PanicStr("Failed to get sender account: " + err.Error())
	}

	if len(schoolName) == 0 {
		env.PanicStr("School name cannot be empty")
	}
	if len(text) == 0 {
		env.PanicStr("Report text cannot be empty")
	}

	newReport := Report{
		Author:     sender,
		SchoolName: schoolName,
		Category:   category,
		Text:       text,
		Tips:       "0",
	}
	c.Reports = append(c.Reports, newReport)
	env.LogString("New report added. School: " + schoolName)
}

// @contract:mutating
// @contract:payable
func (c *Contract) TipReport(reportIndex uint32) {
	deposit, err := env.GetAttachedDeposit()
	if err != nil {
		env.PanicStr("Failed to get attached deposit: " + err.Error())
	}

	if reportIndex >= uint32(len(c.Reports)) {
		env.PanicStr("Report not found!")
	}

	// 10% commission to treasury, 90% to report author as tracked tips
	ten := new(big.Int).SetInt64(10)
	hundred := new(big.Int).SetInt64(100)

	depositInt, ok := new(big.Int).SetString(deposit.String(), 10)
	if !ok {
		depositInt = big.NewInt(0)
	}

	fee := new(big.Int).Mul(depositInt, ten)
	fee.Div(fee, hundred)

	authorShare := new(big.Int).Sub(depositInt, fee)

	// Add fee to treasury
	treasury, ok := new(big.Int).SetString(c.Treasury, 10)
	if !ok {
		treasury = big.NewInt(0)
	}
	treasury.Add(treasury, fee)
	c.Treasury = treasury.String()

	// Add author share to report's tips
	tips, ok := new(big.Int).SetString(c.Reports[reportIndex].Tips, 10)
	if !ok {
		tips = big.NewInt(0)
	}
	tips.Add(tips, authorShare)
	c.Reports[reportIndex].Tips = tips.String()

	env.LogString("Tip received!")
}

// @contract:mutating
func (c *Contract) Withdraw() {
	sender, err := env.GetPredecessorAccountID()
	if err != nil {
		env.PanicStr("Failed to get predecessor account: " + err.Error())
	}

	if sender != c.OwnerID {
		env.PanicStr("Only owner can withdraw treasury funds")
	}

	amount128, err := types.U128FromString(c.Treasury)
	if err != nil {
		env.PanicStr("Failed to parse treasury: " + err.Error())
	}

	promiseId := env.PromiseBatchCreate([]byte(c.OwnerID))
	env.PromiseBatchActionTransfer(promiseId, amount128)

	c.Treasury = "0"
	env.LogString("Treasury withdrawn successfully!")
}

// @contract:view
func (c *Contract) GetReports() []Report {
	return c.Reports
}

// @contract:view
func (c *Contract) GetReportCount() int {
	return len(c.Reports)
}

// @contract:view
func (c *Contract) GetTreasury() string {
	return c.Treasury
}

// @contract:view
func (c *Contract) GetOwner() string {
	return c.OwnerID
}

func main() {}
