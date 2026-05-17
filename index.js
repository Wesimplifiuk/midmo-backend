const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bike API running')
})

app.post('/search-contact', async (req, res) => {

  try {

    const { email } = req.body

    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const contact =
      response.data.results[0]

    if (!contact) {

      return res.json({
        found: false
      })

    }

    return res.json({
      found: true,
      contact
    })

  } catch (error) {

    console.log(error.response?.data || error.message)

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`)
})