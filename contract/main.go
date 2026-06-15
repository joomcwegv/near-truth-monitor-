package main

import (
	"github.com/vlmoon99/near-sdk-go/env"
	"github.com/vlmoon99/near-sdk-go/types"
)

// Report — бұл Владтың "Message" құрылымы, тек біздің жобаға бейімделген
type Report struct {
	Author     types.AccountId `json:"author"`
	SchoolName string          `json:"school_name"`
	Category   string          `json:"category"`
	Text       string          `json:"text"`
	Tips       types.Balance   `json:"tips"` // Жиналған донат/пайда
}

// Contract — біздің негізгі смарт-келісімшарт (Владтың архитектурасы негізінде)
// @contract:state
type Contract struct {
	Reports     []Report        `json:"reports"`
	Treasury    types.Balance   `json:"treasury"` // Біздің комиссия (пайдамыз)
	OwnerID     types.AccountId `json:"owner_id"`
}

// Default — келісімшартты бастапқыда іске қосады
func Default() *Contract {
	return &Contract{
		Reports:  make([]Report, 0),
		Treasury: types.U128("0"),
		OwnerID:  env.PredecessorAccountId(), // Келісімшарт иесі (біз)
	}
}

// AddReport — жаңа шағым/отчет қосады
func (c *Contract) AddReport(schoolName, category, text string) {
	sender := env.PredecessorAccountId()

	newReport := Report{
		Author:     sender,
		SchoolName: schoolName,
		Category:   category,
		Text:       text,
		Tips:       types.U128("0"),
	}

	c.Reports = append(c.Reports, newReport)
	env.LogString("Жаңа шағым жазылды (Влад архитектурасы). Мектеп: " + schoolName)
}

// TipReport — Шағым авторына донат жасау (10% біздің пайдамызға қалады)
func (c *Contract) TipReport(reportIndex uint32) {
	deposit := env.AttachedDeposit()
	
	// Егер донат жіберілмесе
	if deposit.Cmp(types.U128("0")) <= 0 {
		env.PanicString("Донат сомасы 0-ден үлкен болуы керек!")
	}

	if int(reportIndex) >= len(c.Reports) {
		env.PanicString("Мұндай шағым табылмады!")
	}

	// 10% комиссия ұстап қаламыз (пайда)
	fee := types.U128Mul(deposit, types.U128("10"))
	fee = types.U128Div(fee, types.U128("100"))
	
	// Қалған 90% авторына
	authorShare := types.U128Sub(deposit, fee)

	// Біздің қазынаға комиссияны қосамыз
	c.Treasury = types.U128Add(c.Treasury, fee)

	// Автордың шотына жібереміз (Promise арқылы жіберуге болады, немесе балансына қосамыз)
	// Владтың архитектурасы бойынша қарапайым етіп жазамыз:
	c.Reports[reportIndex].Tips = types.U128Add(c.Reports[reportIndex].Tips, authorShare)
	
	env.LogString("Донат түсті! Пайдамыз артты 💰")
}

// GetReports — бәрін оқып береді
func (c *Contract) GetReports() []Report {
	return c.Reports
}

func main() {
	// NEAR SDK талабы
}
