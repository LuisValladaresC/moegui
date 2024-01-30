function filterObjectsBySearch(search, data, searchProperties = null) {
  let results = [];

  data.map(object => {
    for (const property in object) {
      if (Array.isArray(searchProperties) && searchProperties.length >= 1) {
        if (!searchProperties.includes(property)) continue;
      }

      if (typeof object[property] == "string") {
        let propertyValue = object[property].trim().toLowerCase();
        if (propertyValue.includes(search.trim().toLowerCase())) {
          results.push(object);
          break;
        }
      }
    }
  });

  return results;
}