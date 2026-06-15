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