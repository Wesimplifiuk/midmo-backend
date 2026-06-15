const express  = require('express')
const cors     = require('cors')
const axios    = require('axios')
const multer   = require('multer')
const FormData = require('form-data')

const app    = express()
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

app.post('/hubspot-webhook', async (req, res) => {
  res.status(200).send('OK')

  const event = req.body[0]
  const contactId = event.objectId

  const response = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=hs_object_source_detail_1`,
    {
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`
      }
    }
  )

  const contact = await response.json()

  const sourceDetail =
    contact.properties.hs_object_source_detail_1

  if (sourceDetail !== 'New Complete Forms') {
    console.log('Ignoring contact')
    return
  }

  console.log('Processing contact', contactId)

  // continuar flujo
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
})
