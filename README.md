# Surf4b

Provides a way to easily surface information regarding commonly used / uncommon function calls

```javascript
// In memory database for the last 100 blocks:

{
    'blocks': {
        '1': {
            'txHash': ['0x12345678', '0x3456789']
        }
    },
    '0x12345': {
        'txHash': count,
    },
}
```