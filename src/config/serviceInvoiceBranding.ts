/**
 * Default seller block for the tax invoice when a store has not filled
 * its own invoice header in Regions. Store invoice fields always override these.
 */
export const SERVICE_INVOICE_BRANDING = {
  sellerDisplayName: "ZIMSON Watch Store",
  sellerLegalName: "Zimson Times Pvt. Ltd.",
  sellerAddressLines: [
    "84 Cross Cut Rd, Peranaiadu Layout",
    "Ram Nagar, Coimbatore, Tamil Nadu 641012",
  ] as string[],
  sellerGstin: "33AAACZ0566D1ZN",
  sellerPhone: "04224377333",
  sellerEmail: "frontdesk.cbe@zimson.net",
  sellerStateCode: "33",
  legalFooter: "ZIMSON TIMES PVT LTD",
  bankDetailsLines: [
    "Bank: — (configure in settings)",
    "A/c: — · IFSC: —",
  ] as string[],
  footerTerms: [
    "One year warranty applicable for battery replacement.",
    "The battery of the watch is fitted in the country of origin and therefore may have a sticker remaining like scan than that of the battery.",
    "Guarantee the battery is not covered under the 2 year guarantee.",
    "Any damage caused to the watch by the customer is not covered irrespective of how it is caused.",
    "Master straps, glass or any other item subject to wear and tear are not covered.",
    "This guarantee shall be deemed void should the watch have been opened, repaired or altered by any person other than an authorised service centre.",
  ] as string[],
} as const;
